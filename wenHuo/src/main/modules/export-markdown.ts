import { formatChapterTitle } from '@shared/chapter-title';
import { loadManuscript, type Manuscript } from './manuscript-content';
import type { Db } from '../db/connection';

/** 段落化：导出器统一按空行分段，不依赖编辑器内部结构。 */
function paragraphs(plainText: string): string[] {
  return plainText
    .split(/\n{2,}/)
    .map((block) => block.replace(/\s+$/g, '').trim())
    .filter(Boolean);
}

/**
 * Markdown：`# 卷` / `## 章`（与 PRD 一致），书名与作者放 front matter。
 * 这样粘进 Typora / Obsidian / Hugo 都能直接成层级。
 */
export function renderMarkdown(manuscript: Manuscript): string {
  const lines: string[] = ['---'];
  lines.push(`title: ${manuscript.title}`);
  if (manuscript.author.trim()) lines.push(`author: ${manuscript.author.trim()}`);
  lines.push('---', '');

  for (const volume of manuscript.volumes) {
    lines.push(`# ${volume.title}`, '');
    for (const chapter of volume.chapters) {
      lines.push(`## ${formatChapterTitle(chapter.number, chapter.title)}`, '');
      const body = paragraphs(chapter.plainText);
      if (body.length > 0) {
        lines.push(...body, '');
      }
    }
  }

  return `${lines
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trimEnd()}\n`;
}

export function buildMarkdown(db: Db, projectId: string, volumeId?: string): string {
  return renderMarkdown(loadManuscript(db, projectId, volumeId));
}
