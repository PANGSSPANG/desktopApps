import { describe, expect, it } from 'vitest';
import { AppError } from '@shared/errors';
import { saveChapter } from '@main/modules/chapter';
import { getTree } from '@main/modules/manuscript';
import { createProject } from '@main/modules/project';
import { search } from '@main/modules/search';
import {
  deleteEntity,
  getEntity,
  linkEntity,
  listBacklinks,
  listChapterEntities,
  listEntities,
  saveEntity,
  unlinkEntity,
} from '@main/modules/world';
import { createTempDb } from './helpers/temp-db';

function docJson(text: string): string {
  return JSON.stringify({
    type: 'doc',
    content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
  });
}

function setup() {
  const temp = createTempDb();
  const project = createProject(temp.db, { title: '青云志', genre: 'novel' });
  const tree = getTree(temp.db, project.id);
  const chapterId = tree.volumes[0]?.chapters[0]?.id as string;

  saveChapter(temp.db, {
    chapterId,
    contentJson: docJson('玄清站在青云观前。'),
    plainText: '玄清站在青云观前。',
  });

  return { ...temp, project, chapterId };
}

describe('设定库', () => {
  it('新建人物卡后可读回', () => {
    const { db, project, cleanup } = setup();
    try {
      const entity = saveEntity(db, {
        projectId: project.id,
        kind: 'character',
        name: '玄清',
        alias: '玄清道长',
        role: '青云观主',
        description: '性情寡淡，擅长用剑。',
        relations: '青云子的师父',
      });

      expect(entity.name).toBe('玄清');
      expect(entity.kind).toBe('character');
      expect(entity.chapterCount).toBe(0);

      const detail = getEntity(db, entity.id);
      expect(detail.description).toContain('性情寡淡');
      expect(detail.relations).toContain('青云子');

      expect(listEntities(db, project.id)).toHaveLength(1);
      expect(listEntities(db, project.id, 'location')).toHaveLength(0);
    } finally {
      cleanup();
    }
  });

  it('别名会被写进搜索文本，能搜到', () => {
    const { db, project, cleanup } = setup();
    try {
      saveEntity(db, {
        projectId: project.id,
        kind: 'character',
        name: '玄清',
        alias: '玄清道长',
      });

      const page = search(db, { projectId: project.id, q: '玄清道长' });
      expect(page.entities).toHaveLength(1);
      expect(page.entities[0]?.title).toBe('玄清');
    } finally {
      cleanup();
    }
  });

  it('改名后搜索文本同步更新', () => {
    const { db, project, cleanup } = setup();
    try {
      const entity = saveEntity(db, {
        projectId: project.id,
        kind: 'character',
        name: '玄清',
        alias: '老道士',
      });

      saveEntity(db, {
        id: entity.id,
        projectId: project.id,
        kind: 'character',
        name: '玄清子',
        alias: '青云观主',
      });

      expect(search(db, { projectId: project.id, q: '青云观主' }).entities).toHaveLength(1);
      expect(search(db, { projectId: project.id, q: '老道士' }).entities).toHaveLength(0);
    } finally {
      cleanup();
    }
  });

  it('章节关联与反向引用互通', () => {
    const { db, project, chapterId, cleanup } = setup();
    try {
      const entity = saveEntity(db, {
        projectId: project.id,
        kind: 'location',
        name: '青云观',
      });

      linkEntity(db, chapterId, entity.id);

      expect(listChapterEntities(db, chapterId)).toHaveLength(1);
      expect(listBacklinks(db, entity.id)).toHaveLength(1);
      expect(getEntity(db, entity.id).chapters[0]?.id).toBe(chapterId);
      expect(listEntities(db, project.id)[0]?.chapterCount).toBe(1);

      unlinkEntity(db, chapterId, entity.id);
      expect(listChapterEntities(db, chapterId)).toHaveLength(0);
      expect(listBacklinks(db, entity.id)).toHaveLength(0);
    } finally {
      cleanup();
    }
  });

  it('重复关联不会产生重复行', () => {
    const { db, project, chapterId, cleanup } = setup();
    try {
      const entity = saveEntity(db, { projectId: project.id, kind: 'item', name: '青锋剑' });
      linkEntity(db, chapterId, entity.id);
      linkEntity(db, chapterId, entity.id);
      expect(listChapterEntities(db, chapterId)).toHaveLength(1);
    } finally {
      cleanup();
    }
  });

  it('删除设定卡会一并清掉关联', () => {
    const { db, project, chapterId, cleanup } = setup();
    try {
      const entity = saveEntity(db, { projectId: project.id, kind: 'character', name: '玄清' });
      linkEntity(db, chapterId, entity.id);

      deleteEntity(db, entity.id);

      expect(listChapterEntities(db, chapterId)).toHaveLength(0);
      expect(() => getEntity(db, entity.id)).toThrow(AppError);
    } finally {
      cleanup();
    }
  });

  it('名称为空或 id 不存在时报错', () => {
    const { db, project, cleanup } = setup();
    try {
      expect(() =>
        saveEntity(db, { projectId: project.id, kind: 'character', name: '  ' }),
      ).toThrow(AppError);
      expect(() =>
        saveEntity(db, { id: 'ghost', projectId: project.id, kind: 'character', name: '无名' }),
      ).toThrow(AppError);
    } finally {
      cleanup();
    }
  });
});
