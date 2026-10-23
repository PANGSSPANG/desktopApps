import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { getTree } from '@main/modules/manuscript';
import { createProject } from '@main/modules/project';
import { createAppPaths, ensureAppPaths } from '@main/paths';
import {
  clearDraft,
  listRecoveryCandidates,
  readDraft,
  stashDraft,
} from '@main/services/draft-journal';
import { createTempDb } from './helpers/temp-db';

function setup() {
  const dir = mkdtempSync(join(tmpdir(), 'wenhuo-drafts-'));
  const paths = createAppPaths(dir);
  ensureAppPaths(paths);
  const temp = createTempDb();
  const project = createProject(temp.db, { title: '青云志', genre: 'webnovel' });
  const chapterId = getTree(temp.db, project.id).volumes[0]?.chapters[0]?.id as string;
  return {
    ...temp,
    dir,
    paths,
    project,
    chapterId,
    cleanupAll() {
      temp.cleanup();
      rmSync(dir, { recursive: true, force: true });
    },
  };
}

describe('草稿日志', () => {
  it('写入后可读回并识别为恢复候选', () => {
    const ctx = setup();
    try {
      ctx.db
        .prepare('UPDATE chapters SET updated_at = ? WHERE id = ?')
        .run(Date.now() - 60_000, ctx.chapterId);

      stashDraft(ctx.paths, {
        chapterId: ctx.chapterId,
        projectId: ctx.project.id,
        contentJson: '{}',
        plainText: '没来得及保存的一段',
        wordCount: 8,
        savedAt: Date.now(),
      });

      expect(readDraft(ctx.paths, ctx.chapterId)?.plainText).toBe('没来得及保存的一段');

      const candidates = listRecoveryCandidates(ctx.paths, ctx.db);
      expect(candidates).toHaveLength(1);
      expect(candidates[0]?.chapterId).toBe(ctx.chapterId);
      expect(candidates[0]?.chapterTitle).toBe('第一章');
    } finally {
      ctx.cleanupAll();
    }
  });

  it('草稿比库还旧时自动清理，不打扰用户', () => {
    const ctx = setup();
    try {
      stashDraft(ctx.paths, {
        chapterId: ctx.chapterId,
        projectId: ctx.project.id,
        contentJson: '{}',
        plainText: '旧的',
        wordCount: 2,
        savedAt: Date.now() - 120_000,
      });

      ctx.db
        .prepare('UPDATE chapters SET updated_at = ? WHERE id = ?')
        .run(Date.now(), ctx.chapterId);

      expect(listRecoveryCandidates(ctx.paths, ctx.db)).toHaveLength(0);
      expect(readDraft(ctx.paths, ctx.chapterId)).toBeNull();
    } finally {
      ctx.cleanupAll();
    }
  });

  it('章节已删除的草稿被清掉', () => {
    const ctx = setup();
    try {
      stashDraft(ctx.paths, {
        chapterId: 'ghost-chapter',
        projectId: ctx.project.id,
        contentJson: '{}',
        plainText: '幽灵',
        wordCount: 2,
        savedAt: Date.now() + 1000,
      });

      expect(listRecoveryCandidates(ctx.paths, ctx.db)).toHaveLength(0);
      expect(readDraft(ctx.paths, 'ghost-chapter')).toBeNull();
    } finally {
      ctx.cleanupAll();
    }
  });

  it('保存成功后清掉草稿', () => {
    const ctx = setup();
    try {
      stashDraft(ctx.paths, {
        chapterId: ctx.chapterId,
        projectId: ctx.project.id,
        contentJson: '{}',
        plainText: 'x',
        wordCount: 1,
        savedAt: Date.now(),
      });
      clearDraft(ctx.paths, ctx.chapterId);
      expect(readDraft(ctx.paths, ctx.chapterId)).toBeNull();
    } finally {
      ctx.cleanupAll();
    }
  });
});
