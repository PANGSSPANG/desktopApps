import { describe, expect, it } from 'vitest';
import { AppError } from '@shared/errors';
import { patchChapter, saveChapter } from '@main/modules/chapter';
import { getTree } from '@main/modules/manuscript';
import { createProject } from '@main/modules/project';
import {
  AUTO_SNAPSHOT_KEEP,
  clearLegacyPreRestore,
  createSnapshot,
  deleteSnapshot,
  getSnapshot,
  listSnapshots,
  maybeAutoSnapshot,
  pruneAutoSnapshots,
  restoreSnapshot,
} from '@main/modules/snapshot';
import { getOverview } from '@main/modules/stats';
import { createTempDb } from './helpers/temp-db';

function docJson(text: string): string {
  return JSON.stringify({
    type: 'doc',
    content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
  });
}

function setup() {
  const temp = createTempDb();
  const project = createProject(temp.db, { title: '青云志', genre: 'webnovel' });
  const chapterId = getTree(temp.db, project.id).volumes[0]?.chapters[0]?.id as string;
  const save = (text: string) =>
    saveChapter(temp.db, { chapterId, contentJson: docJson(text), plainText: text });
  return { ...temp, project, chapterId, save };
}

describe('快照', () => {
  it('手动快照保存当前正文并可读回', () => {
    const { db, cleanup, chapterId, save } = setup();
    try {
      save('第一版正文');
      const snapshot = createSnapshot(db, { chapterId, kind: 'manual', note: '初稿' });

      expect(snapshot.kind).toBe('manual');
      expect(snapshot.note).toBe('初稿');
      expect(snapshot.wordCount).toBe(5);

      const detail = getSnapshot(db, snapshot.id);
      expect(detail.plainText).toBe('第一版正文');
      expect(listSnapshots(db, chapterId).filter((item) => item.kind === 'manual')).toHaveLength(1);
    } finally {
      cleanup();
    }
  });

  it('自动快照按内容去重', () => {
    const { db, cleanup, chapterId, save } = setup();
    try {
      save('同样的一段话');
      const first = createSnapshot(db, { chapterId, kind: 'auto' });
      const second = createSnapshot(db, { chapterId, kind: 'auto' });

      expect(second.id).toBe(first.id);
      expect(listSnapshots(db, chapterId)).toHaveLength(1);
    } finally {
      cleanup();
    }
  });

  it('内容未变且未满 10 分钟时不重复打点', () => {
    const { db, cleanup, chapterId, save } = setup();
    try {
      save('第一段');
      save('第一段');
      expect(maybeAutoSnapshot(db, chapterId)).toBeNull();
    } finally {
      cleanup();
    }
  });

  it('净增 2000 字触发新的自动快照', () => {
    const { db, cleanup, chapterId, save } = setup();
    try {
      save('开头');
      save('云'.repeat(2100));
      const snapshots = listSnapshots(db, chapterId).filter((item) => item.kind === 'auto');
      expect(snapshots.length).toBe(2);
      expect(snapshots[0]?.wordCount).toBe(2100);
    } finally {
      cleanup();
    }
  });

  it('空章节不产生自动快照', () => {
    const { db, cleanup, chapterId } = setup();
    try {
      expect(maybeAutoSnapshot(db, chapterId)).toBeNull();
    } finally {
      cleanup();
    }
  });

  it('自动快照只保留最近 N 条', () => {
    const { db, cleanup, chapterId, save } = setup();
    try {
      save('底稿');
      const insert = db.prepare(
        `INSERT INTO snapshots
           (id, chapter_id, kind, content_json, plain_text, content_hash, word_count, note, created_at)
         VALUES (?, ?, 'auto', ?, 'x', ?, 1, '', ?)`,
      );
      for (let index = 0; index < 60; index += 1) {
        insert.run(`s${index}`, chapterId, '{}', `hash-${index}`, Date.now() - index * 1000);
      }

      pruneAutoSnapshots(db, chapterId);
      const remaining = listSnapshots(db, chapterId, 1000).filter((item) => item.kind === 'auto');
      expect(remaining.length).toBe(AUTO_SNAPSHOT_KEEP);
      expect(remaining.some((item) => item.id === 's0')).toBe(true);
      expect(remaining.some((item) => item.id === 's59')).toBe(false);
    } finally {
      cleanup();
    }
  });

  it('恢复快照直接覆盖当前正文', () => {
    const { db, cleanup, chapterId, project, save } = setup();
    try {
      save('第一版');
      const snapshot = createSnapshot(db, { chapterId, kind: 'manual', note: '第一版存点' });
      save('第二版改坏了');

      const restored = restoreSnapshot(db, snapshot.id);
      expect(restored.contentJson).toBe(docJson('第一版'));

      const stats = getOverview(db, project.id);
      expect(stats.totalWords).toBe(3);
    } finally {
      cleanup();
    }
  });

  it('恢复不产生「恢复前」快照，也不新增任何记录', () => {
    const { db, cleanup, chapterId, save } = setup();
    try {
      save('第一版');
      const snapshot = createSnapshot(db, { chapterId, kind: 'manual', note: '回到这一版' });
      save('第二版');

      const before = listSnapshots(db, chapterId, 1000);
      restoreSnapshot(db, snapshot.id);
      const after = listSnapshots(db, chapterId, 1000);

      expect(after).toHaveLength(before.length);
      expect(after.some((item) => item.kind === 'pre_restore')).toBe(false);
    } finally {
      cleanup();
    }
  });

  it('可以清理旧版「恢复前」记录，其它快照保留', () => {
    const { db, cleanup, chapterId, save } = setup();
    try {
      save('第一版');
      const manual = createSnapshot(db, { chapterId, kind: 'manual', note: '要留下的' });

      const insert = db.prepare(
        `INSERT INTO snapshots
           (id, chapter_id, kind, content_json, plain_text, content_hash, word_count, note, created_at)
         VALUES (?, ?, 'pre_restore', '{}', 'x', ?, 1, '', ?)`,
      );
      insert.run('legacy1', chapterId, 'legacy-hash-1', Date.now() - 2000);
      insert.run('legacy2', chapterId, 'legacy-hash-2', Date.now() - 1000);

      const removed = clearLegacyPreRestore(db, chapterId);

      expect(removed).toBe(2);
      const remaining = listSnapshots(db, chapterId, 1000);
      expect(remaining.some((item) => item.kind === 'pre_restore')).toBe(false);
      expect(remaining.some((item) => item.id === manual.id)).toBe(true);
    } finally {
      cleanup();
    }
  });

  it('已完成章节不能恢复快照', () => {
    const { db, cleanup, chapterId, save } = setup();
    try {
      save('第一版');
      const snapshot = createSnapshot(db, { chapterId, kind: 'manual', note: '旧版' });
      save('第二版');
      patchChapter(db, chapterId, { status: 'done' });

      expect(() => restoreSnapshot(db, snapshot.id)).toThrow(AppError);
    } finally {
      cleanup();
    }
  });

  it('可以删除单条快照，不影响其它快照', () => {
    const { db, cleanup, chapterId, save } = setup();
    try {
      save('第一版');
      const first = createSnapshot(db, { chapterId, kind: 'manual', note: 'A' });
      save('第二版');
      const second = createSnapshot(db, { chapterId, kind: 'manual', note: 'B' });

      deleteSnapshot(db, first.id);

      const remaining = listSnapshots(db, chapterId).map((item) => item.id);
      expect(remaining).not.toContain(first.id);
      expect(remaining).toContain(second.id);
    } finally {
      cleanup();
    }
  });

  it('删除不存在的快照报 NOT_FOUND', () => {
    const { db, cleanup } = setup();
    try {
      expect(() => deleteSnapshot(db, 'no-such-snapshot')).toThrow(AppError);
    } finally {
      cleanup();
    }
  });
});
