import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { saveChapter } from '@main/modules/chapter';
import { getTree } from '@main/modules/manuscript';
import { createProject } from '@main/modules/project';
import { search } from '@main/modules/search';
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
  const tree = getTree(temp.db, project.id);
  const chapterId = tree.volumes[0]?.chapters[0]?.id as string;

  saveChapter(temp.db, {
    chapterId,
    contentJson: docJson('青云观上有一棵松，观主法号玄清。'),
    plainText: '青云观上有一棵松，观主法号玄清。',
  });

  temp.db
    .prepare(
      `INSERT INTO entities
         (id, project_id, kind, name, alias, role, profile_json, search_text, sort_order, created_at, updated_at)
       VALUES (?, ?, 'character', '玄清', '玄清道长', '青云观主', '{}', ?, 0, ?, ?)`,
    )
    .run(randomUUID(), project.id, '玄清 玄清道长 青云观主 性情寡淡。', Date.now(), Date.now());

  return { ...temp, project, chapterId };
}

describe('全文搜索', () => {
  it('3 字以上走 FTS 并能命中正文', () => {
    const { db, project, cleanup } = setup();
    try {
      const page = search(db, { projectId: project.id, q: '青云观' });
      expect(page.chapters).toHaveLength(1);
      expect(page.chapters[0]?.title).toBe('第一章');
      expect(page.chapters[0]?.context).toContain('[[');
    } finally {
      cleanup();
    }
  });

  it('1–2 字走 LIKE 兜底，同样能命中', () => {
    const { db, project, cleanup } = setup();
    try {
      const page = search(db, { projectId: project.id, q: '青云' });
      expect(page.chapters).toHaveLength(1);
      expect(page.chapters[0]?.context).toContain('[[青云]]');
    } finally {
      cleanup();
    }
  });

  it('设定卡可被搜到并归入 entities', () => {
    const { db, project, cleanup } = setup();
    try {
      const page = search(db, { projectId: project.id, q: '玄清道长' });
      expect(page.entities).toHaveLength(1);
      expect(page.entities[0]?.title).toBe('玄清');
    } finally {
      cleanup();
    }
  });

  it('同一章多处命中会展开成多条结果', () => {
    const { db, project, chapterId, cleanup } = setup();
    try {
      saveChapter(db, {
        chapterId,
        contentJson: docJson('青云观前，青云观后，还是青云观。'),
        plainText: '青云观前，青云观后，还是青云观。',
      });

      const page = search(db, { projectId: project.id, q: '青云观' });
      expect(page.chapters).toHaveLength(3);
      expect(page.chapters.map((hit) => hit.occurrence)).toEqual([0, 1, 2]);
      expect(new Set(page.chapters.map((hit) => hit.id)).size).toBe(3);
      expect(page.chapters[0]?.context).toContain('[[青云观]]');
    } finally {
      cleanup();
    }
  });

  it('只在标题里命中时仍保留一条结果', () => {
    const { db, project, chapterId, cleanup } = setup();
    try {
      db.prepare('UPDATE chapters SET title = ? WHERE id = ?').run('青云观夜话', chapterId);
      const page = search(db, { projectId: project.id, q: '夜话' });
      expect(page.chapters.length).toBeGreaterThanOrEqual(1);
      expect(page.chapters[0]?.title).toBe('青云观夜话');
    } finally {
      cleanup();
    }
  });

  it('无结果时返回空数组', () => {
    const { db, project, cleanup } = setup();
    try {
      const page = search(db, { projectId: project.id, q: '完全不存在的词' });
      expect(page.chapters).toHaveLength(0);
      expect(page.entities).toHaveLength(0);
    } finally {
      cleanup();
    }
  });

  it('含引号与通配符的查询不报错', () => {
    const { db, project, cleanup } = setup();
    try {
      expect(() => search(db, { projectId: project.id, q: '"青云"' })).not.toThrow();
      expect(() => search(db, { projectId: project.id, q: '100%_' })).not.toThrow();
    } finally {
      cleanup();
    }
  });

  it('空查询直接返回空结果', () => {
    const { db, project, cleanup } = setup();
    try {
      expect(search(db, { projectId: project.id, q: '   ' }).chapters).toHaveLength(0);
    } finally {
      cleanup();
    }
  });
});
