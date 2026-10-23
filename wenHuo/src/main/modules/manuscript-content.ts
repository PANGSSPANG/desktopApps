import { AppError } from '@shared/errors';
import type { Db } from '../db/connection';

export interface ManuscriptChapter {
  id: string;
  number: number;
  title: string;
  plainText: string;
}

export interface ManuscriptVolume {
  id: string;
  title: string;
  chapters: ManuscriptChapter[];
}

export interface Manuscript {
  projectId: string;
  title: string;
  author: string;
  volumes: ManuscriptVolume[];
}

interface Row {
  volume_id: string;
  volume_title: string;
  chapter_id: string;
  chapter_title: string;
  plain_text: string;
}

/**
 * 一次性把整本书读成有序的卷章结构，供各导出器共用。
 * 导出器只吃这个结构，不再各自写 SQL，格式之间不会出现"章序不一致"。
 */
export function loadManuscript(db: Db, projectId: string, volumeId?: string): Manuscript {
  const project = db.prepare('SELECT title, author FROM projects WHERE id = ?').get(projectId) as
    { title: string; author: string } | undefined;
  if (!project) throw new AppError('NOT_FOUND', '项目不存在。');

  const rows = db
    .prepare(
      `SELECT v.id AS volume_id, v.title AS volume_title,
              c.id AS chapter_id, c.title AS chapter_title, c.plain_text
       FROM volumes v
       LEFT JOIN chapters c ON c.volume_id = v.id
       WHERE v.project_id = ? AND (? IS NULL OR v.id = ?)
       ORDER BY v.sort_order, v.created_at, c.sort_order, c.created_at`,
    )
    .all(projectId, volumeId ?? null, volumeId ?? null) as Row[];

  const volumes: ManuscriptVolume[] = [];
  let sequence = 0;
  const byId = new Map<string, ManuscriptVolume>();

  for (const row of rows) {
    let volume = byId.get(row.volume_id);
    if (!volume) {
      volume = { id: row.volume_id, title: row.volume_title, chapters: [] };
      byId.set(row.volume_id, volume);
      volumes.push(volume);
    }
    if (row.chapter_id) {
      sequence += 1;
      volume.chapters.push({
        id: row.chapter_id,
        number: sequence,
        title: row.chapter_title,
        plainText: row.plain_text,
      });
    }
  }

  return {
    projectId,
    title: project.title,
    author: project.author,
    volumes,
  };
}
