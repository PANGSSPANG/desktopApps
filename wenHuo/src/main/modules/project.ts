import { randomUUID } from 'node:crypto';
import { rmSync } from 'node:fs';
import { toChineseNumber } from '@shared/chinese-number';
import { EMPTY_DOC_JSON } from '@shared/editor-doc';
import { AppError } from '@shared/errors';
import { isGenre, profileOf } from '@shared/project-type';
import { SORT_GAP } from '@shared/sort-order';
import type { CreateProjectInput, ProjectSummary } from '@shared/types';
import type { Db } from '../db/connection';
import { projectDataDir, type AppPaths } from '../paths';

interface ProjectRow {
  id: string;
  title: string;
  author: string;
  genre: string;
  synopsis: string;
  target_words: number;
  daily_goal: number;
  created_at: number;
  updated_at: number;
  total_words: number;
  chapter_count: number;
}

const SUMMARY_COLUMNS = `
  p.id, p.title, p.author, p.genre, p.synopsis, p.target_words, p.daily_goal,
  p.created_at, p.updated_at,
  COALESCE((SELECT SUM(c.word_count) FROM chapters c WHERE c.project_id = p.id), 0) AS total_words,
  (SELECT COUNT(*) FROM chapters c WHERE c.project_id = p.id) AS chapter_count
`;

function toSummary(row: ProjectRow): ProjectSummary {
  const genre = isGenre(row.genre) ? row.genre : 'novel';
  const totalWords = Number(row.total_words);
  const targetWords = Number(row.target_words);
  return {
    id: row.id,
    title: row.title,
    author: row.author,
    genre,
    synopsis: row.synopsis,
    targetWords,
    dailyGoal: Number(row.daily_goal),
    totalWords,
    chapterCount: Number(row.chapter_count),
    progress: targetWords > 0 ? Math.min(1, totalWords / targetWords) : 0,
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at),
  };
}

export function listProjects(db: Db): ProjectSummary[] {
  const rows = db
    .prepare(
      `SELECT ${SUMMARY_COLUMNS} FROM projects p
       WHERE p.deleted_at IS NULL
       ORDER BY p.updated_at DESC, p.rowid DESC`,
    )
    .all() as ProjectRow[];
  return rows.map(toSummary);
}

export function getProject(db: Db, projectId: string): ProjectSummary {
  const row = db
    .prepare(`SELECT ${SUMMARY_COLUMNS} FROM projects p WHERE p.id = ? AND p.deleted_at IS NULL`)
    .get(projectId) as ProjectRow | undefined;
  if (!row) throw new AppError('NOT_FOUND', '项目不存在或已被删除。');
  return toSummary(row);
}

/**
 * 建项目。
 * 默认同时建「第一卷 / 第一章」，保证进入工作台即可开始写；
 * 导入流程传 withDefaults: false，避免多出一章空白。
 */
export function createProject(
  db: Db,
  input: CreateProjectInput,
  options: { withDefaults?: boolean } = {},
): ProjectSummary {
  const title = input.title.trim();
  if (!title) throw new AppError('INVALID_ARGUMENT', '书名不能为空。');

  const profile = profileOf(input.genre);
  const now = Date.now();
  const projectId = randomUUID();
  const targetWords = input.targetWords ?? profile.defaultTargetWords;
  const dailyGoal = input.dailyGoal ?? profile.defaultDailyGoal;
  const withDefaults = options.withDefaults !== false;

  const run = db.transaction(() => {
    db.prepare(
      `INSERT INTO projects
         (id, title, author, genre, synopsis, target_words, daily_goal, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      projectId,
      title,
      input.author?.trim() ?? '',
      input.genre,
      input.synopsis ?? '',
      targetWords,
      dailyGoal,
      now,
      now,
    );

    if (!withDefaults) return;

    const volumeId = randomUUID();
    db.prepare(
      `INSERT INTO volumes (id, project_id, title, sort_order, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ).run(volumeId, projectId, `第${toChineseNumber(1)}卷`, SORT_GAP, now, now);

    db.prepare(
      `INSERT INTO chapters
         (id, project_id, volume_id, title, content_json, plain_text, word_count,
          status, synopsis, content_hash, sort_order, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, '', 0, 'draft', '', '', ?, ?, ?)`,
    ).run(
      randomUUID(),
      projectId,
      volumeId,
      `第${toChineseNumber(1)}章`,
      EMPTY_DOC_JSON,
      SORT_GAP,
      now,
      now,
    );
  });

  run();
  return getProject(db, projectId);
}

export function renameProject(db: Db, projectId: string, title: string): void {
  const nextTitle = title.trim();
  if (!nextTitle) throw new AppError('INVALID_ARGUMENT', '书名不能为空。');
  const result = db
    .prepare('UPDATE projects SET title = ?, updated_at = ? WHERE id = ?')
    .run(nextTitle, Date.now(), projectId);
  if (result.changes === 0) throw new AppError('NOT_FOUND', '项目不存在。');
}

export function deleteProject(db: Db, paths: AppPaths, projectId: string): void {
  const result = db.prepare('DELETE FROM projects WHERE id = ?').run(projectId);
  if (result.changes === 0) throw new AppError('NOT_FOUND', '项目不存在。');
  rmSync(projectDataDir(paths, projectId), { recursive: true, force: true });
}
