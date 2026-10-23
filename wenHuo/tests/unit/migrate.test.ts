import { describe, expect, it } from 'vitest';
import { currentVersion, migrate } from '@main/db/migrate';
import { createTempDb } from './helpers/temp-db';

describe('migrate', () => {
  it('空库迁移到最新版本', () => {
    const { db, cleanup } = createTempDb();
    try {
      expect(currentVersion(db)).toBe(1);
    } finally {
      cleanup();
    }
  });

  it('重复执行幂等', () => {
    const { db, cleanup } = createTempDb();
    try {
      const report = migrate(db);
      expect(report.applied).toEqual([]);
      expect(report.to).toBe(1);
    } finally {
      cleanup();
    }
  });

  it('核心表与全文索引都已建立', () => {
    const { db, cleanup } = createTempDb();
    try {
      const tables = db
        .prepare("SELECT name FROM sqlite_master WHERE type IN ('table', 'view') ORDER BY name")
        .all() as { name: string }[];
      const names = tables.map((table) => table.name);
      for (const expected of [
        'projects',
        'volumes',
        'chapters',
        'entities',
        'chapter_links',
        'snapshots',
        'writing_sessions',
        'settings',
        'search_index',
      ]) {
        expect(names).toContain(expected);
      }
    } finally {
      cleanup();
    }
  });

  it('外键级联删除生效', () => {
    const { db, cleanup } = createTempDb();
    try {
      db.prepare(
        `INSERT INTO projects (id, title, genre, created_at, updated_at)
         VALUES ('p1', '测试', 'novel', 1, 1)`,
      ).run();
      db.prepare(
        `INSERT INTO volumes (id, project_id, title, sort_order, created_at, updated_at)
         VALUES ('v1', 'p1', '第一卷', 1000, 1, 1)`,
      ).run();
      db.prepare(
        `INSERT INTO chapters (id, project_id, volume_id, title, word_count, sort_order, created_at, updated_at)
         VALUES ('c1', 'p1', 'v1', '第一章', 0, 1000, 1, 1)`,
      ).run();

      db.prepare("DELETE FROM projects WHERE id = 'p1'").run();

      const chapters = db.prepare('SELECT COUNT(*) AS count FROM chapters').get() as {
        count: number;
      };
      expect(chapters.count).toBe(0);
    } finally {
      cleanup();
    }
  });
});
