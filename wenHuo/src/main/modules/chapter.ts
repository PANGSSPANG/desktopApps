import { randomUUID } from 'node:crypto';
import { todayKey } from '@shared/date-key';
import { AppError } from '@shared/errors';
import { isChapterLocked } from '@shared/types';
import type {
  ChapterDetail,
  ChapterStatus,
  ChapterSummary,
  SaveChapterInput,
  SaveChapterResult,
} from '@shared/types';
import { countWords } from '@shared/word-count';
import type { Db } from '../db/connection';
import { hashContent } from './content-hash';
import { chapterNumberOf, toChapterStatus, toChapterSummary, type ChapterRow } from './manuscript';
import { maybeAutoSnapshot } from './snapshot';

export interface ChapterFullRow extends ChapterRow {
  content_json: string;
  plain_text: string;
  content_hash: string;
}

export function getChapter(db: Db, chapterId: string): ChapterDetail {
  const row = db.prepare('SELECT * FROM chapters WHERE id = ?').get(chapterId) as
    ChapterFullRow | undefined;
  if (!row) throw new AppError('NOT_FOUND', '章节不存在或已被删除。');
  return { ...toChapterSummary(row, chapterNumberOf(db, row.id)), contentJson: row.content_json };
}

/**
 * 一次保存 = 一个事务：正文、字数、hash、项目更新时间、当日写作增量。
 * 字数始终由 plainText 重算，不信任调用方传来的数字。
 */
export function saveChapter(db: Db, input: SaveChapterInput): SaveChapterResult {
  const wordCount = countWords(input.plainText);
  const contentHash = hashContent(input.contentJson);
  const now = Date.now();

  const run = db.transaction(() => {
    const row = db
      .prepare('SELECT project_id, word_count, content_hash, status FROM chapters WHERE id = ?')
      .get(input.chapterId) as
      { project_id: string; word_count: number; content_hash: string; status: string } | undefined;
    if (!row) throw new AppError('NOT_FOUND', '章节不存在，无法保存。');
    if (isChapterLocked(toChapterStatus(row.status))) {
      throw new AppError('CHAPTER_LOCKED');
    }

    if (
      input.baseHash !== undefined &&
      row.content_hash !== '' &&
      input.baseHash !== row.content_hash
    ) {
      throw new AppError('CONFLICT_STALE_CONTENT');
    }

    const delta = wordCount - Number(row.word_count);

    db.prepare(
      `UPDATE chapters
         SET content_json = ?, plain_text = ?, word_count = ?, content_hash = ?, updated_at = ?
       WHERE id = ?`,
    ).run(input.contentJson, input.plainText, wordCount, contentHash, now, input.chapterId);

    db.prepare('UPDATE projects SET updated_at = ? WHERE id = ?').run(now, row.project_id);

    if (delta !== 0) {
      db.prepare(
        `INSERT INTO writing_sessions
           (id, project_id, date_key, started_at, ended_at, words_written)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT (project_id, date_key) DO UPDATE SET
           words_written = words_written + excluded.words_written,
           ended_at = excluded.ended_at`,
      ).run(randomUUID(), row.project_id, todayKey(new Date(now)), now, now, delta);
    }

    return delta;
  });

  const sessionWords = run();

  // 自动快照是"锦上添花"，失败绝不能影响一次成功的保存
  try {
    maybeAutoSnapshot(db, input.chapterId);
  } catch {
    // 忽略：下次保存仍会重新评估
  }

  return { chapterId: input.chapterId, wordCount, savedAt: now, sessionWords, contentHash };
}

export function patchChapter(
  db: Db,
  chapterId: string,
  patch: { status?: ChapterStatus; synopsis?: string },
): ChapterSummary {
  const row = db.prepare('SELECT * FROM chapters WHERE id = ?').get(chapterId) as
    ChapterFullRow | undefined;
  if (!row) throw new AppError('NOT_FOUND', '章节不存在。');

  const status = patch.status ?? toChapterStatus(row.status);
  const synopsis = patch.synopsis ?? row.synopsis;
  const now = Date.now();

  db.prepare('UPDATE chapters SET status = ?, synopsis = ?, updated_at = ? WHERE id = ?').run(
    status,
    synopsis,
    now,
    chapterId,
  );

  return toChapterSummary(
    { ...row, status, synopsis, updated_at: now },
    chapterNumberOf(db, chapterId),
  );
}
