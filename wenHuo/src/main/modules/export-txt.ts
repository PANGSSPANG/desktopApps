import { writeFileSync } from 'node:fs';
import type { Db } from '../db/connection';
import { formatChapterTitle } from '@shared/chapter-title';
import { loadManuscript, type Manuscript } from './manuscript-content';

/**
 * 投稿用 TXT：卷章层级原样保留，带 UTF-8 BOM 与 CRLF，
 * 老式 Windows 投稿系统才认中文。
 */
export function renderTxt(manuscript: Manuscript): string {
  const blocks: string[] = [`《${manuscript.title}》`];
  if (manuscript.author.trim()) blocks.push(`作者：${manuscript.author.trim()}`);
  blocks.push('');

  for (const volume of manuscript.volumes) {
    blocks.push(volume.title, '');
    for (const chapter of volume.chapters) {
      blocks.push(formatChapterTitle(chapter.number, chapter.title), '');
      const text = chapter.plainText.trim();
      if (text) blocks.push(text, '');
    }
  }

  return `\uFEFF${blocks.join('\r\n')}`;
}

export function buildTxt(db: Db, projectId: string, volumeId?: string): string {
  return renderTxt(loadManuscript(db, projectId, volumeId));
}

export function exportTxt(
  db: Db,
  projectId: string,
  filePath: string,
): { filePath: string; bytes: number } {
  const content = buildTxt(db, projectId);
  writeFileSync(filePath, content, 'utf8');
  return { filePath, bytes: Buffer.byteLength(content, 'utf8') };
}
