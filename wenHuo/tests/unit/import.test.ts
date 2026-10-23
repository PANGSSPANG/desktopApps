import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { commitImport, decodeFile, previewImport } from '@main/modules/import';
import { getTree } from '@main/modules/manuscript';
import { createProject, listProjects } from '@main/modules/project';
import { createTempDb } from './helpers/temp-db';

function withTempFile(content: string, name = '青云志.txt'): { path: string; clean(): void } {
  const dir = mkdtempSync(join(tmpdir(), 'wenhuo-import-'));
  const path = join(dir, name);
  writeFileSync(path, content, 'utf8');
  return {
    path,
    clean() {
      rmSync(dir, { recursive: true, force: true });
    },
  };
}

const SAMPLE = ['第一章 青云观', '观上有一棵松。', '', '第二章 玄清', '观主法号玄清。'].join('\n');

describe('decodeFile', () => {
  it('UTF-8 正常解码', () => {
    expect(decodeFile(Buffer.from('青云观', 'utf8'))).toBe('青云观');
  });

  it('去掉 UTF-8 BOM', () => {
    expect(decodeFile(Buffer.from('\uFEFF青云观', 'utf8'))).toBe('青云观');
  });
});

describe('previewImport', () => {
  it('按标题拆章并给出统计', () => {
    const file = withTempFile(SAMPLE);
    try {
      const preview = previewImport(file.path, 'chapter');
      expect(preview.chapters).toHaveLength(2);
      expect(preview.suggestedTitle).toBe('青云志');
      expect(preview.totalChars).toBeGreaterThan(0);
      expect(preview.warnings).toEqual([]);
    } finally {
      file.clean();
    }
  });
});

describe('commitImport', () => {
  it('导入到新项目：只建一卷，不再多出空的「第一章」', () => {
    const { db, cleanup } = createTempDb();
    const file = withTempFile(SAMPLE);
    try {
      const preview = previewImport(file.path, 'chapter');
      const result = commitImport(db, {
        projectTitle: '青云志',
        chapters: preview.chapters,
      });

      expect(result.imported).toBe(2);

      const tree = getTree(db, result.projectId);
      expect(tree.volumes).toHaveLength(1);
      expect(tree.volumes[0]?.chapters).toHaveLength(2);
      expect(tree.volumes[0]?.chapters[0]?.title).toBe('第一章 青云观');
      expect(tree.volumes[0]?.chapters[1]?.title).toBe('第二章 玄清');
      expect(tree.volumes[0]?.chapters[0]?.wordCount).toBe(6);

      const projects = listProjects(db);
      expect(projects[0]?.title).toBe('青云志');
      expect(projects[0]?.chapterCount).toBe(2);
    } finally {
      file.clean();
      cleanup();
    }
  });

  it('导入到已有项目：追加一卷，原有章节不受影响', () => {
    const { db, cleanup } = createTempDb();
    const file = withTempFile(SAMPLE);
    try {
      const project = createProject(db, { title: '原项目', genre: 'novel' });
      const before = getTree(db, project.id);
      const preview = previewImport(file.path, 'chapter');

      const result = commitImport(db, { projectId: project.id, chapters: preview.chapters });

      const after = getTree(db, project.id);
      expect(after.volumes).toHaveLength(before.volumes.length + 1);
      expect(after.volumes[1]?.title).toBe('导入内容');
      expect(after.volumes[1]?.chapters).toHaveLength(2);
      expect(after.volumes[0]?.chapters).toHaveLength(1);
      expect(result.projectId).toBe(project.id);
    } finally {
      file.clean();
      cleanup();
    }
  });

  it('空章节列表拒绝导入', () => {
    const { db, cleanup } = createTempDb();
    try {
      expect(() => commitImport(db, { projectTitle: '空书', chapters: [] })).toThrow();
    } finally {
      cleanup();
    }
  });
});
