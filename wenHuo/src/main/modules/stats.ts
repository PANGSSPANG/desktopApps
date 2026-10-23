import { computeStreak, todayKey } from '@shared/date-key';
import { AppError } from '@shared/errors';
import type { StatsOverview } from '@shared/types';
import type { Db } from '../db/connection';

export function getOverview(db: Db, projectId: string): StatsOverview {
  const project = db.prepare('SELECT daily_goal FROM projects WHERE id = ?').get(projectId) as
    { daily_goal: number } | undefined;
  if (!project) throw new AppError('NOT_FOUND', '项目不存在。');

  const aggregate = db
    .prepare(
      `SELECT COALESCE(SUM(word_count), 0) AS total,
              COUNT(*) AS chapters,
              COALESCE(SUM(CASE WHEN status = 'done' THEN 1 ELSE 0 END), 0) AS done
       FROM chapters WHERE project_id = ?`,
    )
    .get(projectId) as { total: number; chapters: number; done: number };

  const today = todayKey();
  const session = db
    .prepare('SELECT words_written FROM writing_sessions WHERE project_id = ? AND date_key = ?')
    .get(projectId, today) as { words_written: number } | undefined;

  const days = db
    .prepare(
      `SELECT date_key FROM writing_sessions
       WHERE project_id = ? AND words_written > 0
       ORDER BY date_key DESC LIMIT 400`,
    )
    .all(projectId) as { date_key: string }[];

  return {
    projectId,
    totalWords: Number(aggregate.total),
    todayWords: Math.max(0, Number(session?.words_written ?? 0)),
    dailyGoal: Number(project.daily_goal),
    streak: computeStreak(
      days.map((day) => day.date_key),
      today,
    ),
    chapterCount: Number(aggregate.chapters),
    doneCount: Number(aggregate.done),
  };
}
