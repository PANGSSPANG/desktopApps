import { writeFileSync } from 'node:fs';
import { sanitizeFileName } from '@shared/file-name';
import type { Db } from '../db/connection';
import { renderEpub } from './export-epub';
import { buildMarkdown } from './export-markdown';
import { buildTxt } from './export-txt';
import { loadManuscript } from './manuscript-content';

export const EXPORT_FORMATS = ['txt', 'markdown', 'epub'] as const;
export type ExportKind = (typeof EXPORT_FORMATS)[number];

export const EXPORT_LABELS: Record<ExportKind, string> = {
  txt: 'TXT（投稿）',
  markdown: 'Markdown',
  epub: 'EPUB（电子书）',
};

export const EXPORT_EXTENSIONS: Record<ExportKind, string> = {
  txt: 'txt',
  markdown: 'md',
  epub: 'epub',
};

export function isExportKind(value: string): value is ExportKind {
  return (EXPORT_FORMATS as readonly string[]).includes(value);
}

export function suggestedFileName(title: string, kind: ExportKind): string {
  return `${sanitizeFileName(title)}.${EXPORT_EXTENSIONS[kind]}`;
}

/** 各格式统一从同一条「整本稿件」链路出，保证章序一致。 */
export function runExport(
  db: Db,
  projectId: string,
  kind: ExportKind,
  filePath: string,
  volumeId?: string,
): { filePath: string; bytes: number } {
  if (kind === 'txt') {
    const content = buildTxt(db, projectId, volumeId);
    writeFileSync(filePath, content, 'utf8');
    return { filePath, bytes: Buffer.byteLength(content, 'utf8') };
  }

  if (kind === 'markdown') {
    const content = buildMarkdown(db, projectId, volumeId);
    writeFileSync(filePath, content, 'utf8');
    return { filePath, bytes: Buffer.byteLength(content, 'utf8') };
  }

  const bytes = renderEpub(loadManuscript(db, projectId, volumeId));
  writeFileSync(filePath, bytes);
  return { filePath, bytes: bytes.byteLength };
}
