import { randomUUID } from 'node:crypto';
import { parseChineseNumber, toChineseNumber } from '@shared/chinese-number';
import { AppError } from '@shared/errors';
import { EMPTY_DOC_JSON } from '@shared/editor-doc';
import { orderBetween } from '@shared/sort-order';
import type { ChapterStatus, ChapterSummary, VolumeNode, VolumeTree } from '@shared/types';
import type { Db } from '../db/connection';

interface VolumeRow {
  id: string;
  project_id: string;
  title: string;
  sort_order: number;
}

export interface ChapterRow {
  id: string;
  project_id: string;
  volume_id: string;
  title: string;
  status: string;
  synopsis: string;
  word_count: number;
  sort_order: number;
  updated_at: number;
}

const CHAPTER_STATUSES: readonly ChapterStatus[] = ['draft', 'revising', 'done'];

export function toChapterStatus(value: string): ChapterStatus {
  return CHAPTER_STATUSES.includes(value as ChapterStatus) ? (value as ChapterStatus) : 'draft';
}

export function toChapterSummary(row: ChapterRow, number: number): ChapterSummary {
  return {
    id: row.id,
    number,
    projectId: row.project_id,
    volumeId: row.volume_id,
    title: row.title,
    status: toChapterStatus(row.status),
    synopsis: row.synopsis,
    wordCount: Number(row.word_count),
    sortOrder: Number(row.sort_order),
    updatedAt: Number(row.updated_at),
  };
}

export function getTree(db: Db, projectId: string): VolumeTree {
  const exists = db.prepare('SELECT 1 FROM projects WHERE id = ?').get(projectId);
  if (!exists) throw new AppError('NOT_FOUND', '项目不存在。');

  const volumes = db
    .prepare(
      `SELECT id, project_id, title, sort_order FROM volumes
       WHERE project_id = ? ORDER BY sort_order, created_at`,
    )
    .all(projectId) as VolumeRow[];

  const chapters = db
    .prepare(
      `SELECT c.id, c.project_id, c.volume_id, c.title, c.status, c.synopsis,
              c.word_count, c.sort_order, c.updated_at
       FROM chapters c JOIN volumes v ON v.id = c.volume_id
       WHERE c.project_id = ?
       ORDER BY v.sort_order, v.created_at, c.sort_order, c.created_at`,
    )
    .all(projectId) as ChapterRow[];

  const nodes: VolumeNode[] = volumes.map((volume) => ({
    id: volume.id,
    projectId: volume.project_id,
    title: volume.title,
    sortOrder: Number(volume.sort_order),
    chapters: [],
  }));

  const byId = new Map(nodes.map((node) => [node.id, node]));
  let sequence = 0;
  for (const chapter of chapters) {
    sequence += 1;
    byId.get(chapter.volume_id)?.chapters.push(toChapterSummary(chapter, sequence));
  }

  return { projectId, volumes: nodes };
}

/** 取「已用最大卷号 + 1」：删掉前面的卷后，新卷不会与现存卷重名。 */
function nextVolumeTitle(db: Db, projectId: string): string {
  const rows = db.prepare('SELECT title FROM volumes WHERE project_id = ?').all(projectId) as {
    title: string;
  }[];
  const max = rows.reduce((acc, item) => {
    const match = /第\s*([零一二三四五六七八九十百千万两0-9]+)\s*卷/.exec(item.title);
    return Math.max(acc, match?.[1] ? parseChineseNumber(match[1]) : 0);
  }, 0);
  return `第${toChineseNumber(max + 1)}卷`;
}

export function createVolume(db: Db, projectId: string, title?: string): VolumeTree {
  const last = db
    .prepare('SELECT sort_order FROM volumes WHERE project_id = ? ORDER BY sort_order DESC LIMIT 1')
    .get(projectId) as { sort_order: number } | undefined;

  const now = Date.now();
  db.prepare(
    `INSERT INTO volumes (id, project_id, title, sort_order, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(
    randomUUID(),
    projectId,
    title?.trim() || nextVolumeTitle(db, projectId),
    orderBetween(last ? Number(last.sort_order) : null, null),
    now,
    now,
  );

  return getTree(db, projectId);
}

export function createChapter(db: Db, volumeId: string, title?: string): VolumeTree {
  const volume = db.prepare('SELECT project_id FROM volumes WHERE id = ?').get(volumeId) as
    { project_id: string } | undefined;
  if (!volume) throw new AppError('NOT_FOUND', '卷不存在，无法新建章节。');

  const last = db
    .prepare('SELECT sort_order FROM chapters WHERE volume_id = ? ORDER BY sort_order DESC LIMIT 1')
    .get(volumeId) as { sort_order: number } | undefined;

  const now = Date.now();
  db.prepare(
    `INSERT INTO chapters
       (id, project_id, volume_id, title, content_json, plain_text, word_count,
        status, synopsis, content_hash, sort_order, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, '', 0, 'draft', '', '', ?, ?, ?)`,
  ).run(
    randomUUID(),
    volume.project_id,
    volumeId,
    title?.trim() ?? '',
    EMPTY_DOC_JSON,
    orderBetween(last ? Number(last.sort_order) : null, null),
    now,
    now,
  );

  return getTree(db, volume.project_id);
}

export function renameChapter(db: Db, chapterId: string, title: string): void {
  const nextTitle = title.trim();
  if (!nextTitle) throw new AppError('INVALID_ARGUMENT', '章节标题不能为空。');
  const result = db
    .prepare('UPDATE chapters SET title = ?, updated_at = ? WHERE id = ?')
    .run(nextTitle, Date.now(), chapterId);
  if (result.changes === 0) throw new AppError('NOT_FOUND', '章节不存在。');
}

export function deleteChapter(db: Db, chapterId: string): VolumeTree {
  const row = db.prepare('SELECT project_id FROM chapters WHERE id = ?').get(chapterId) as
    { project_id: string } | undefined;
  if (!row) throw new AppError('NOT_FOUND', '章节不存在。');

  const result = db.prepare('DELETE FROM chapters WHERE id = ?').run(chapterId);
  if (result.changes === 0) throw new AppError('NOT_FOUND', '章节不存在。');

  return getTree(db, row.project_id);
}

/** 删除卷：卷下章节由外键级联删除，搜索索引由触发器同步清理。 */
export function deleteVolume(db: Db, volumeId: string): VolumeTree {
  const row = db.prepare('SELECT project_id FROM volumes WHERE id = ?').get(volumeId) as
    { project_id: string } | undefined;
  if (!row) throw new AppError('NOT_FOUND', '卷不存在。');

  db.prepare('DELETE FROM volumes WHERE id = ?').run(volumeId);
  return getTree(db, row.project_id);
}

/** 单章查询时算出它的派生章号（与树里的编号口径完全一致）。 */
export function chapterNumberOf(db: Db, chapterId: string): number {
  const row = db
    .prepare(
      `SELECT number FROM (
         SELECT c.id,
                ROW_NUMBER() OVER (
                  ORDER BY v.sort_order, v.created_at, c.sort_order, c.created_at
                ) AS number
         FROM chapters c
         JOIN volumes v ON v.id = c.volume_id
         WHERE c.project_id = (SELECT project_id FROM chapters WHERE id = ?)
       ) WHERE id = ?`,
    )
    .get(chapterId, chapterId) as { number: number } | undefined;
  return row ? Number(row.number) : 0;
}
export interface MoveChapterInput {
  chapterId: string;
  targetVolumeId: string;
  /** 插到这一章之前；null 表示追加到目标卷末尾 */
  beforeChapterId: string | null;
}

/**
 * 移动章节（同卷排序或跨卷）。
 * 只改被移动的这一行：sort_order 取目标位置前后两章的中点，避免整卷重排。
 */
export function moveChapter(db: Db, input: MoveChapterInput): VolumeTree {
  const chapter = db
    .prepare('SELECT project_id, volume_id FROM chapters WHERE id = ?')
    .get(input.chapterId) as { project_id: string; volume_id: string } | undefined;
  if (!chapter) throw new AppError('NOT_FOUND', '章节不存在。');

  const target = db
    .prepare('SELECT project_id FROM volumes WHERE id = ?')
    .get(input.targetVolumeId) as { project_id: string } | undefined;
  if (!target) throw new AppError('NOT_FOUND', '目标卷不存在。');

  let order: number;
  if (input.beforeChapterId) {
    const before = db
      .prepare('SELECT sort_order FROM chapters WHERE id = ? AND volume_id = ?')
      .get(input.beforeChapterId, input.targetVolumeId) as { sort_order: number } | undefined;
    if (!before) throw new AppError('NOT_FOUND', '目标位置不存在。');

    const prev = db
      .prepare(
        'SELECT sort_order FROM chapters WHERE volume_id = ? AND sort_order < ? ORDER BY sort_order DESC LIMIT 1',
      )
      .get(input.targetVolumeId, Number(before.sort_order)) as { sort_order: number } | undefined;
    order = orderBetween(prev ? Number(prev.sort_order) : null, Number(before.sort_order));
  } else {
    const last = db
      .prepare(
        'SELECT sort_order FROM chapters WHERE volume_id = ? ORDER BY sort_order DESC LIMIT 1',
      )
      .get(input.targetVolumeId) as { sort_order: number } | undefined;
    order = orderBetween(last ? Number(last.sort_order) : null, null);
  }

  db.prepare('UPDATE chapters SET volume_id = ?, sort_order = ?, updated_at = ? WHERE id = ?').run(
    input.targetVolumeId,
    order,
    Date.now(),
    input.chapterId,
  );

  return getTree(db, chapter.project_id);
}
/** 卷之间排序：只改被拖动那一卷的 sort_order，取其前后两卷的中点。 */
export function moveVolume(db: Db, volumeId: string, beforeVolumeId: string | null): VolumeTree {
  const volume = db.prepare('SELECT project_id FROM volumes WHERE id = ?').get(volumeId) as
    { project_id: string } | undefined;
  if (!volume) throw new AppError('NOT_FOUND', '卷不存在。');
  const projectId = volume.project_id;

  let order: number;
  if (beforeVolumeId) {
    const before = db
      .prepare('SELECT sort_order FROM volumes WHERE id = ? AND project_id = ?')
      .get(beforeVolumeId, projectId) as { sort_order: number } | undefined;
    if (!before) throw new AppError('NOT_FOUND', '目标位置不存在。');

    const prev = db
      .prepare(
        'SELECT sort_order FROM volumes WHERE project_id = ? AND sort_order < ? ORDER BY sort_order DESC LIMIT 1',
      )
      .get(projectId, Number(before.sort_order)) as { sort_order: number } | undefined;
    order = orderBetween(prev ? Number(prev.sort_order) : null, Number(before.sort_order));
  } else {
    const last = db
      .prepare(
        'SELECT sort_order FROM volumes WHERE project_id = ? ORDER BY sort_order DESC LIMIT 1',
      )
      .get(projectId) as { sort_order: number } | undefined;
    order = orderBetween(last ? Number(last.sort_order) : null, null);
  }

  db.prepare('UPDATE volumes SET sort_order = ?, updated_at = ? WHERE id = ?').run(
    order,
    Date.now(),
    volumeId,
  );
  return getTree(db, projectId);
}
