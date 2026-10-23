import { randomUUID } from 'node:crypto';
import { todayKey } from '@shared/date-key';
import { AppError } from '@shared/errors';
import { isChapterLocked } from '@shared/types';
import type { ChapterDetail, SnapshotDetail, SnapshotKind, SnapshotSummary } from '@shared/types';
import type { Db } from '../db/connection';
import { hashContent } from './content-hash';
import { chapterNumberOf, toChapterStatus, toChapterSummary } from './manuscript';

/** 自动快照节奏：距上次 10 分钟，或本章净增 2000 字，先到先触发。 */
export const AUTO_SNAPSHOT_INTERVAL_MS = 10 * 60 * 1000;
export const AUTO_SNAPSHOT_MIN_WORDS = 2000;
/** 每章自动快照保留上限：最近 50 条且不超过 30 天；手动快照永不清理。 */
export const AUTO_SNAPSHOT_KEEP = 50;
export const AUTO_SNAPSHOT_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

interface SnapshotRow {
  id: string;
  chapter_id: string;
  kind: string;
  content_json: string;
  plain_text: string;
  content_hash: string;
  word_count: number;
  note: string;
  created_at: number;
}

interface ChapterContentRow {
  id: string;
  project_id: string;
  volume_id: string;
  title: string;
  content_json: string;
  plain_text: string;
  word_count: number;
  status: string;
  synopsis: string;
  content_hash: string;
  sort_order: number;
  updated_at: number;
}

function toSnapshotSummary(row: SnapshotRow): SnapshotSummary {
  const kind: SnapshotKind =
    row.kind === 'manual' || row.kind === 'pre_restore' ? row.kind : 'auto';
  return {
    id: row.id,
    chapterId: row.chapter_id,
    kind,
    wordCount: Number(row.word_count),
    note: row.note,
    createdAt: Number(row.created_at),
  };
}

function readChapterContent(db: Db, chapterId: string): ChapterContentRow {
  const row = db.prepare('SELECT * FROM chapters WHERE id = ?').get(chapterId) as
    ChapterContentRow | undefined;
  if (!row) throw new AppError('NOT_FOUND', '章节不存在，无法创建快照。');
  return row;
}

/** 只保留最近 N 条与最近 30 天的自动快照；手动与恢复前快照不动。 */
export function pruneAutoSnapshots(db: Db, chapterId: string, now = Date.now()): number {
  const ageCut = db
    .prepare(
      `DELETE FROM snapshots
       WHERE chapter_id = ? AND kind = 'auto' AND created_at < ?`,
    )
    .run(chapterId, now - AUTO_SNAPSHOT_MAX_AGE_MS).changes;

  const overflowCut = db
    .prepare(
      `DELETE FROM snapshots
       WHERE chapter_id = ? AND kind = 'auto'
         AND id NOT IN (
           SELECT id FROM snapshots
           WHERE chapter_id = ? AND kind = 'auto'
           ORDER BY created_at DESC, rowid DESC
           LIMIT ?
         )`,
    )
    .run(chapterId, chapterId, AUTO_SNAPSHOT_KEEP).changes;

  return ageCut + overflowCut;
}

/**
 * 清理旧版本遗留的「恢复前」记录。
 * 早期实现会在每次恢复时自动留档，这些行对用户没有意义，给一个显式清理入口。
 */
export function clearLegacyPreRestore(db: Db, chapterId: string): number {
  return db
    .prepare("DELETE FROM snapshots WHERE chapter_id = ? AND kind = 'pre_restore'")
    .run(chapterId).changes;
}

export function createSnapshot(
  db: Db,
  input: { chapterId: string; kind: SnapshotKind; note?: string },
): SnapshotSummary {
  const chapter = readChapterContent(db, input.chapterId);
  const hash = hashContent(chapter.content_json);
  const now = Date.now();

  // 自动快照按内容去重：同一份正文不重复占空间
  if (input.kind === 'auto') {
    const existing = db
      .prepare(
        `SELECT * FROM snapshots
         WHERE chapter_id = ? AND kind = 'auto' AND content_hash = ?
         ORDER BY created_at DESC LIMIT 1`,
      )
      .get(input.chapterId, hash) as SnapshotRow | undefined;
    if (existing) return toSnapshotSummary(existing);
  }

  const id = randomUUID();
  db.prepare(
    `INSERT INTO snapshots
       (id, chapter_id, kind, content_json, plain_text, content_hash, word_count, note, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    input.chapterId,
    input.kind,
    chapter.content_json,
    chapter.plain_text,
    hash,
    Number(chapter.word_count),
    input.note?.trim() ?? '',
    now,
  );

  if (input.kind === 'auto') pruneAutoSnapshots(db, input.chapterId, now);

  return {
    id,
    chapterId: input.chapterId,
    kind: input.kind,
    wordCount: Number(chapter.word_count),
    note: input.note?.trim() ?? '',
    createdAt: now,
  };
}

/**
 * 直接用给定正文落一条快照（不读库里的当前内容）。
 * 崩溃恢复里"丢弃草稿"要把草稿本身留档，就需要这条路径。
 */
export function insertSnapshot(
  db: Db,
  input: {
    chapterId: string;
    kind: SnapshotKind;
    contentJson: string;
    plainText: string;
    wordCount: number;
    note?: string;
  },
): SnapshotSummary {
  const id = randomUUID();
  const now = Date.now();
  const hash = hashContent(input.contentJson);
  db.prepare(
    `INSERT INTO snapshots
       (id, chapter_id, kind, content_json, plain_text, content_hash, word_count, note, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    input.chapterId,
    input.kind,
    input.contentJson,
    input.plainText,
    hash,
    input.wordCount,
    input.note?.trim() ?? '',
    now,
  );
  return {
    id,
    chapterId: input.chapterId,
    kind: input.kind,
    wordCount: input.wordCount,
    note: input.note?.trim() ?? '',
    createdAt: now,
  };
}

/**
 * 保存成功后调用：满足「10 分钟」或「净增 2000 字」才落一条自动快照。
 * 空章节与内容未变化的一律跳过。
 */
export function maybeAutoSnapshot(db: Db, chapterId: string): SnapshotSummary | null {
  const chapter = readChapterContent(db, chapterId);
  const wordCount = Number(chapter.word_count);
  if (wordCount === 0) return null;

  const last = db
    .prepare(
      `SELECT * FROM snapshots WHERE chapter_id = ? AND kind = 'auto'
       ORDER BY created_at DESC LIMIT 1`,
    )
    .get(chapterId) as SnapshotRow | undefined;

  const now = Date.now();
  if (last) {
    if (last.content_hash === hashContent(chapter.content_json)) return null;
    const elapsed = now - Number(last.created_at);
    const grown = wordCount - Number(last.word_count);
    if (elapsed < AUTO_SNAPSHOT_INTERVAL_MS && grown < AUTO_SNAPSHOT_MIN_WORDS) return null;
  }

  return createSnapshot(db, { chapterId, kind: 'auto' });
}

export function listSnapshots(db: Db, chapterId: string, limit = 50): SnapshotSummary[] {
  const rows = db
    .prepare(
      `SELECT id, chapter_id, kind, content_json, plain_text, content_hash, word_count, note, created_at
       FROM snapshots WHERE chapter_id = ? ORDER BY created_at DESC, rowid DESC LIMIT ?`,
    )
    .all(chapterId, limit) as SnapshotRow[];
  return rows.map(toSnapshotSummary);
}

/** 删除单条快照：手动快照也允许删除，用户可能只是打了一次无意义的点。 */
export function deleteSnapshot(db: Db, snapshotId: string): void {
  const result = db.prepare('DELETE FROM snapshots WHERE id = ?').run(snapshotId);
  if (result.changes === 0) throw new AppError('NOT_FOUND', '快照不存在或已被清理。');
}

export function getSnapshot(db: Db, snapshotId: string): SnapshotDetail {
  const row = db.prepare('SELECT * FROM snapshots WHERE id = ?').get(snapshotId) as
    SnapshotRow | undefined;
  if (!row) throw new AppError('NOT_FOUND', '快照不存在或已被清理。');
  return {
    ...toSnapshotSummary(row),
    contentJson: row.content_json,
    plainText: row.plain_text,
  };
}

/**
 * 恢复快照：直接覆盖当前正文，不自动留档。
 * 是否在恢复前保住当前版本，由作者自己决定（面板上就有「留个快照」）。
 */
export function restoreSnapshot(db: Db, snapshotId: string): ChapterDetail {
  const snapshot = db.prepare('SELECT * FROM snapshots WHERE id = ?').get(snapshotId) as
    SnapshotRow | undefined;
  if (!snapshot) throw new AppError('NOT_FOUND', '快照不存在或已被清理。');

  const now = Date.now();
  const run = db.transaction(() => {
    const chapter = readChapterContent(db, snapshot.chapter_id);
    if (isChapterLocked(toChapterStatus(chapter.status))) {
      throw new AppError('CHAPTER_LOCKED', '本章已完成，需先改回草稿才能恢复快照。');
    }
    db.prepare(
      `UPDATE chapters
         SET content_json = ?, plain_text = ?, word_count = ?, content_hash = ?, updated_at = ?
       WHERE id = ?`,
    ).run(
      snapshot.content_json,
      snapshot.plain_text,
      snapshot.word_count,
      snapshot.content_hash,
      now,
      chapter.id,
    );

    db.prepare('UPDATE projects SET updated_at = ? WHERE id = ?').run(now, chapter.project_id);

    const delta = Number(snapshot.word_count) - Number(chapter.word_count);
    if (delta !== 0) {
      db.prepare(
        `INSERT INTO writing_sessions
           (id, project_id, date_key, started_at, ended_at, words_written)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT (project_id, date_key) DO UPDATE SET
           words_written = words_written + excluded.words_written,
           ended_at = excluded.ended_at`,
      ).run(randomUUID(), chapter.project_id, todayKey(new Date(now)), now, now, delta);
    }

    return {
      chapter,
      contentJson: snapshot.content_json,
    };
  });

  const { chapter, contentJson } = run();
  const updated = {
    ...chapter,
    content_json: contentJson,
    plain_text: snapshot.plain_text,
    word_count: Number(snapshot.word_count),
    updated_at: now,
  };
  return { ...toChapterSummary(updated, chapterNumberOf(db, chapter.id)), contentJson };
}
