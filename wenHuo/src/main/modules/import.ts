import { randomUUID } from 'node:crypto';
import { readFileSync, statSync } from 'node:fs';
import { basename, extname } from 'node:path';
import { textToDocJson, textToPlainText } from '@shared/editor-doc';
import { AppError } from '@shared/errors';
import { SORT_GAP } from '@shared/sort-order';
import { splitChapters, type SplitRule } from '@shared/split-chapters';
import type { ImportCommitInput, ImportCommitResult, ImportPreview } from '@shared/types';
import { countWords } from '@shared/word-count';
import type { Db } from '../db/connection';
import { hashContent } from './content-hash';
import { createVolume, getTree } from './manuscript';
import { createProject } from './project';

/** 50MB 足够装下 200 万字的 TXT，再大基本是选错文件了。 */
const MAX_BYTES = 50 * 1024 * 1024;
const MAX_CHAPTERS = 2000;

/**
 * 中文 TXT 常见三种编码：UTF-8（可能带 BOM）、UTF-8、GBK。
 * 先按 UTF-8 严格解码，失败再退回 GBK——反过来会把大部分 UTF-8 文件读成乱码。
 */
export function decodeFile(buffer: Buffer): string {
  if (buffer.length >= 3 && buffer[0] === 0xef && buffer[1] === 0xbb && buffer[2] === 0xbf) {
    return new TextDecoder('utf-8').decode(buffer.subarray(3));
  }
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buffer);
  } catch {
    try {
      return new TextDecoder('gbk').decode(buffer);
    } catch {
      return new TextDecoder('utf-8').decode(buffer);
    }
  }
}

export function previewImport(filePath: string, rule: SplitRule): ImportPreview {
  const stats = statSync(filePath);
  if (!stats.isFile()) throw new AppError('IMPORT_FAILED', '请选择一个文件，而不是文件夹。');
  if (stats.size > MAX_BYTES) {
    throw new AppError('IMPORT_FAILED', '文件超过 50MB，请拆分后再导入。');
  }

  const text = decodeFile(readFileSync(filePath));
  const baseName = basename(filePath, extname(filePath));
  const { chapters, warnings } = splitChapters(text, rule, baseName);

  if (chapters.length > MAX_CHAPTERS) {
    throw new AppError(
      'IMPORT_FAILED',
      `识别出 ${chapters.length} 章，超过 ${MAX_CHAPTERS} 章上限。`,
    );
  }

  return {
    filePath,
    suggestedTitle: baseName,
    rule,
    totalChars: text.length,
    chapters,
    warnings,
  };
}

/**
 * 落库：可选导入到已有项目（追加一卷），或直接新建一本新书。
 * 整个导入是一个事务，中途失败不会留下半本书。
 */
export function commitImport(db: Db, input: ImportCommitInput): ImportCommitResult {
  const chapters = input.chapters
    .map((chapter) => ({
      title: chapter.title.trim(),
      body: chapter.body.trim(),
    }))
    .filter((chapter) => chapter.title.length > 0 || chapter.body.length > 0);

  if (chapters.length === 0) throw new AppError('IMPORT_FAILED', '没有可导入的章节。');
  if (chapters.length > MAX_CHAPTERS) {
    throw new AppError('IMPORT_FAILED', `章节数超过 ${MAX_CHAPTERS}，请先拆分文件。`);
  }

  const run = db.transaction(() => {
    let projectId = input.projectId;
    if (!projectId) {
      // 新建的书不建默认空章节，避免导入后多出一章空白
      const project = createProject(
        db,
        { title: input.projectTitle?.trim() || '导入的书', genre: 'novel' },
        { withDefaults: false },
      );
      projectId = project.id;
    }

    const tree = createVolume(db, projectId, input.volumeTitle ?? '导入内容');
    const volumeId = tree.volumes.at(-1)?.id;
    if (!volumeId) throw new AppError('IMPORT_FAILED', '创建导入卷失败。');

    const insert = db.prepare(
      `INSERT INTO chapters
         (id, project_id, volume_id, title, content_json, plain_text, word_count,
          status, synopsis, content_hash, sort_order, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'draft', '', ?, ?, ?, ?)`,
    );

    const now = Date.now();
    chapters.forEach((chapter, index) => {
      const contentJson = textToDocJson(chapter.body);
      const plainText = textToPlainText(chapter.body);
      insert.run(
        randomUUID(),
        projectId,
        volumeId,
        chapter.title || `第 ${index + 1} 章`,
        contentJson,
        plainText,
        countWords(plainText),
        hashContent(contentJson),
        (index + 1) * SORT_GAP,
        now,
        now,
      );
    });

    db.prepare('UPDATE projects SET updated_at = ? WHERE id = ?').run(now, projectId);
    return { projectId, volumeId, tree: getTree(db, projectId) };
  });

  const result = run();
  return { ...result, imported: chapters.length };
}
