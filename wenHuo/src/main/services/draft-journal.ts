import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import type { RecoveryCandidate } from '@shared/types';
import type { Db } from '../db/connection';
import type { AppPaths } from '../paths';

export interface DraftRecord {
  chapterId: string;
  projectId: string;
  contentJson: string;
  plainText: string;
  wordCount: number;
  savedAt: number;
}

function draftFile(paths: AppPaths, chapterId: string): string {
  return join(paths.draftsDir, `${chapterId}.json`);
}

/** 原子写：先写临时文件再改名，避免崩溃时留下半个 JSON。 */
export function stashDraft(paths: AppPaths, record: DraftRecord): void {
  mkdirSync(paths.draftsDir, { recursive: true });
  const target = draftFile(paths, record.chapterId);
  const tmp = `${target}.tmp`;
  writeFileSync(tmp, JSON.stringify(record), 'utf8');
  renameSync(tmp, target);
}

export function clearDraft(paths: AppPaths, chapterId: string): void {
  rmSync(draftFile(paths, chapterId), { force: true });
}

export function readDraft(paths: AppPaths, chapterId: string): DraftRecord | null {
  const file = draftFile(paths, chapterId);
  if (!existsSync(file)) return null;
  try {
    return JSON.parse(readFileSync(file, 'utf8')) as DraftRecord;
  } catch {
    return null;
  }
}

export function clearAllDrafts(paths: AppPaths): void {
  if (!existsSync(paths.draftsDir)) return;
  for (const name of readdirSync(paths.draftsDir)) {
    rmSync(join(paths.draftsDir, name), { force: true });
  }
}

/**
 * 找出"草稿比库里更新"的章节：只有这类才是真正没保存下来的内容。
 * 章节已被删除的草稿直接清掉，避免候选列表里出现幽灵条目。
 */
export function listRecoveryCandidates(paths: AppPaths, db: Db): RecoveryCandidate[] {
  if (!existsSync(paths.draftsDir)) return [];

  const candidates: RecoveryCandidate[] = [];
  for (const name of readdirSync(paths.draftsDir)) {
    if (!name.endsWith('.json')) continue;
    const file = join(paths.draftsDir, name);
    let draft: DraftRecord;
    try {
      draft = JSON.parse(readFileSync(file, 'utf8')) as DraftRecord;
    } catch {
      rmSync(file, { force: true });
      continue;
    }

    const chapter = db
      .prepare('SELECT title, project_id, updated_at FROM chapters WHERE id = ?')
      .get(draft.chapterId) as
      { title: string; project_id: string; updated_at: number } | undefined;

    if (!chapter) {
      rmSync(file, { force: true });
      continue;
    }

    if (Number(draft.savedAt) <= Number(chapter.updated_at)) {
      // 草稿比库还旧，说明之后已经成功保存过
      rmSync(file, { force: true });
      continue;
    }

    candidates.push({
      chapterId: draft.chapterId,
      chapterTitle: chapter.title,
      projectId: chapter.project_id,
      savedAt: Number(draft.savedAt),
      wordCount: Number(draft.wordCount),
    });
  }

  return candidates.sort((a, b) => b.savedAt - a.savedAt);
}
