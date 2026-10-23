import { statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { app, BrowserWindow, dialog, shell } from 'electron';
import { AppError } from '@shared/errors';
import { SPLIT_RULES, type SplitChapter, type SplitRule } from '@shared/split-chapters';
import { ENTITY_KIND_LABELS, type EntityInput, type EntityKind } from '@shared/types';
import { EXPORT_KIND_LABELS } from '@shared/types';
import { IPC } from '@shared/ipc';
import { isGenre } from '@shared/project-type';
import type {
  ChapterDetail,
  ChapterStatus,
  CreateProjectInput,
  ExportTxtResult,
} from '@shared/types';
import { countWords } from '@shared/word-count';
import type { Db } from '../db/connection';
import type { Logger } from '../logger';
import { getChapter, patchChapter, saveChapter } from '../modules/chapter';
import { EXPORT_EXTENSIONS, isExportKind, runExport, suggestedFileName } from '../modules/export';
import {
  createChapter,
  createVolume,
  deleteChapter,
  deleteVolume,
  moveChapter,
  moveVolume,
  getTree,
  renameChapter,
} from '../modules/manuscript';
import {
  createProject,
  deleteProject,
  getProject,
  listProjects,
  renameProject,
} from '../modules/project';
import { commitImport, previewImport } from '../modules/import';
import { search } from '../modules/search';
import {
  deleteEntity,
  getEntity,
  linkEntity,
  listBacklinks,
  listChapterEntities,
  listEntities,
  saveEntity,
  unlinkEntity,
} from '../modules/world';
import {
  createSnapshot,
  clearLegacyPreRestore,
  deleteSnapshot,
  getSnapshot,
  insertSnapshot,
  listSnapshots,
  restoreSnapshot,
} from '../modules/snapshot';
import { getOverview } from '../modules/stats';
import { firstWritableDir, type AppPaths } from '../paths';
import { readPrefs, writePrefs } from '../modules/prefs';
import { createBackup, listBackups, restoreBackup } from '../services/backup';
import { pruneAutoBackups } from '../services/auto-backup';
import {
  clearDraft,
  listRecoveryCandidates,
  readDraft,
  stashDraft,
} from '../services/draft-journal';
import { asOptionalNumber, asOptionalString, asRecord, asString, handle } from './guard';

const CHAPTER_STATUSES: readonly ChapterStatus[] = ['draft', 'revising', 'done'];

export interface IpcContext {
  db: Db;
  paths: AppPaths;
  logger: Logger;
}

function readSetting(db: Db, key: string): string | null {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as
    { value: string } | undefined;
  return row?.value ?? null;
}

function writeSetting(db: Db, key: string, value: string): void {
  db.prepare(
    `INSERT INTO settings (key, value) VALUES (?, ?)
     ON CONFLICT (key) DO UPDATE SET value = excluded.value`,
  ).run(key, value);
}

/**
 * 导出默认目录：优先上次使用的位置，其次「文档 / 桌面」，都不可写时回落到应用数据目录。
 *
 * 受限环境（沙箱、受管终端）里用户目录可能整体不可写，
 * 此时把对话框默认值放在「文档」会让它一打开就提示没有保存权限。
 */
function resolveExportDir(db: Db, paths: AppPaths): string {
  const remembered = readSetting(db, 'lastExportDir') ?? '';
  const appFallback = join(paths.root, 'exports');
  return firstWritableDir(
    [remembered, safeAppPath('documents'), safeAppPath('desktop'), appFallback],
    appFallback,
  );
}

/** 目录被重定向或不存在时 getPath 可能抛错，这里降级成空串，交给 firstWritableDir 跳过。 */
function safeAppPath(name: 'documents' | 'desktop'): string {
  try {
    return app.getPath(name);
  } catch {
    return '';
  }
}

function readLastProjectId(db: Db): string | null {
  return readSetting(db, 'lastProjectId');
}

function writeLastProjectId(db: Db, projectId: string): void {
  writeSetting(db, 'lastProjectId', projectId);
}

export function registerIpc({ db, paths, logger }: IpcContext): void {
  handle(IPC.projectList, logger, () => listProjects(db));

  handle(IPC.projectCreate, logger, (payload) => {
    const input = asRecord(payload);
    const genre = asString(input.genre, '项目类型');
    if (!isGenre(genre)) throw new AppError('INVALID_ARGUMENT', '项目类型不合法。');

    const author = asOptionalString(input.author);
    const targetWords = asOptionalNumber(input.targetWords);
    const dailyGoal = asOptionalNumber(input.dailyGoal);
    const synopsis = asOptionalString(input.synopsis);

    const projectInput: CreateProjectInput = {
      title: asString(input.title, '书名'),
      genre,
      ...(author !== undefined ? { author } : {}),
      ...(targetWords !== undefined ? { targetWords } : {}),
      ...(dailyGoal !== undefined ? { dailyGoal } : {}),
      ...(synopsis !== undefined ? { synopsis } : {}),
    };
    const project = createProject(db, projectInput);
    writeLastProjectId(db, project.id);
    return project;
  });

  handle(IPC.projectRename, logger, (payload) => {
    const input = asRecord(payload);
    renameProject(db, asString(input.id, '项目'), asString(input.title, '书名'));
    return null;
  });

  handle(IPC.projectDelete, logger, (payload) => {
    const input = asRecord(payload);
    deleteProject(db, paths, asString(input.id, '项目'));
    return null;
  });

  handle(IPC.projectOpen, logger, (payload) => {
    const input = asRecord(payload);
    const project = getProject(db, asString(input.id, '项目'));
    writeLastProjectId(db, project.id);
    return project;
  });

  handle(IPC.manuscriptTree, logger, (payload) =>
    getTree(db, asString(asRecord(payload).projectId, '项目')),
  );

  handle(IPC.volumeCreate, logger, (payload) => {
    const input = asRecord(payload);
    return createVolume(db, asString(input.projectId, '项目'), asOptionalString(input.title));
  });

  handle(IPC.chapterCreate, logger, (payload) => {
    const input = asRecord(payload);
    return createChapter(db, asString(input.volumeId, '卷'), asOptionalString(input.title));
  });

  handle(IPC.volumeDelete, logger, (payload) =>
    deleteVolume(db, asString(asRecord(payload).volumeId, '卷')),
  );

  handle(IPC.volumeMove, logger, (payload) => {
    const input = asRecord(payload);
    const before = asOptionalString(input.beforeVolumeId);
    return moveVolume(db, asString(input.volumeId, '卷'), before ?? null);
  });

  handle(IPC.chapterMove, logger, (payload) => {
    const input = asRecord(payload);
    const before = asOptionalString(input.beforeChapterId);
    return moveChapter(db, {
      chapterId: asString(input.chapterId, '章节'),
      targetVolumeId: asString(input.targetVolumeId, '目标卷'),
      beforeChapterId: before ?? null,
    });
  });

  handle(IPC.chapterRename, logger, (payload) => {
    const input = asRecord(payload);
    renameChapter(db, asString(input.chapterId, '章节'), asString(input.title, '章节标题'));
    return null;
  });

  handle(IPC.chapterDelete, logger, (payload) =>
    deleteChapter(db, asString(asRecord(payload).chapterId, '章节')),
  );

  handle(IPC.chapterGet, logger, (payload) =>
    getChapter(db, asString(asRecord(payload).chapterId, '章节')),
  );

  handle(IPC.chapterSave, logger, (payload) => {
    const input = asRecord(payload);
    const baseHash = asOptionalString(input.baseHash);
    return saveChapter(db, {
      chapterId: asString(input.chapterId, '章节'),
      contentJson: asString(input.contentJson, '正文'),
      plainText: asString(input.plainText, '正文'),
      ...(baseHash !== undefined ? { baseHash } : {}),
    });
  });

  handle(IPC.chapterPatch, logger, (payload) => {
    const input = asRecord(payload);
    const rawStatus = asOptionalString(input.status);
    if (rawStatus !== undefined && !CHAPTER_STATUSES.includes(rawStatus as ChapterStatus)) {
      throw new AppError('INVALID_ARGUMENT', '章节状态不合法。');
    }
    const synopsis = asOptionalString(input.synopsis);
    return patchChapter(db, asString(input.chapterId, '章节'), {
      ...(rawStatus !== undefined ? { status: rawStatus as ChapterStatus } : {}),
      ...(synopsis !== undefined ? { synopsis } : {}),
    });
  });

  handle(IPC.worldList, logger, (payload) => {
    const input = asRecord(payload);
    const kind = asOptionalString(input.kind);
    if (kind !== undefined && !(kind in ENTITY_KIND_LABELS)) {
      throw new AppError('INVALID_ARGUMENT', '设定类型不合法。');
    }
    return listEntities(
      db,
      asString(input.projectId, '项目'),
      kind === undefined ? undefined : (kind as EntityKind),
    );
  });

  handle(IPC.worldGet, logger, (payload) =>
    getEntity(db, asString(asRecord(payload).entityId, '设定')),
  );

  handle(IPC.worldSave, logger, (payload) => {
    const input = asRecord(payload);
    const kind = asString(input.kind, '设定类型');
    if (!(kind in ENTITY_KIND_LABELS)) throw new AppError('INVALID_ARGUMENT', '设定类型不合法。');

    const id = asOptionalString(input.id);
    const alias = asOptionalString(input.alias);
    const role = asOptionalString(input.role);
    const description = asOptionalString(input.description);
    const relations = asOptionalString(input.relations);
    const entityInput: EntityInput = {
      projectId: asString(input.projectId, '项目'),
      kind: kind as EntityKind,
      name: asString(input.name, '名称'),
      ...(id !== undefined ? { id } : {}),
      ...(alias !== undefined ? { alias } : {}),
      ...(role !== undefined ? { role } : {}),
      ...(description !== undefined ? { description } : {}),
      ...(relations !== undefined ? { relations } : {}),
    };
    return saveEntity(db, entityInput);
  });

  handle(IPC.worldDelete, logger, (payload) => {
    deleteEntity(db, asString(asRecord(payload).entityId, '设定'));
    return null;
  });

  handle(IPC.worldForChapter, logger, (payload) =>
    listChapterEntities(db, asString(asRecord(payload).chapterId, '章节')),
  );

  handle(IPC.worldLink, logger, (payload) => {
    const input = asRecord(payload);
    return linkEntity(db, asString(input.chapterId, '章节'), asString(input.entityId, '设定'));
  });

  handle(IPC.worldUnlink, logger, (payload) => {
    const input = asRecord(payload);
    return unlinkEntity(db, asString(input.chapterId, '章节'), asString(input.entityId, '设定'));
  });

  handle(IPC.worldBacklinks, logger, (payload) =>
    listBacklinks(db, asString(asRecord(payload).entityId, '设定')),
  );

  handle(IPC.importPick, logger, async () => {
    const window = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0];
    const options = {
      title: '选择要导入的文件',
      properties: ['openFile' as const],
      filters: [{ name: '文本 / Markdown', extensions: ['txt', 'md', 'markdown'] }],
    };
    const picked = window
      ? await dialog.showOpenDialog(window, options)
      : await dialog.showOpenDialog(options);
    if (picked.canceled || picked.filePaths.length === 0) return null;
    return picked.filePaths[0] ?? null;
  });

  handle(IPC.importPreview, logger, (payload) => {
    const input = asRecord(payload);
    const rule = asString(input.rule, '拆章规则');
    if (!(SPLIT_RULES as readonly string[]).includes(rule)) {
      throw new AppError('INVALID_ARGUMENT', '拆章规则不合法。');
    }
    return previewImport(asString(input.filePath, '文件'), rule as SplitRule);
  });

  handle(IPC.importCommit, logger, (payload) => {
    const input = asRecord(payload);
    if (!Array.isArray(input.chapters)) {
      throw new AppError('INVALID_ARGUMENT', '章节数据不合法。');
    }
    const projectId = asOptionalString(input.projectId);
    const projectTitle = asOptionalString(input.projectTitle);
    const volumeTitle = asOptionalString(input.volumeTitle);
    return commitImport(db, {
      ...(projectId ? { projectId } : {}),
      ...(projectTitle ? { projectTitle } : {}),
      ...(volumeTitle ? { volumeTitle } : {}),
      chapters: input.chapters as SplitChapter[],
    });
  });

  handle(IPC.statsOverview, logger, (payload) =>
    getOverview(db, asString(asRecord(payload).projectId, '项目')),
  );

  handle(IPC.prefsGet, logger, () => readPrefs(db));

  handle(IPC.prefsSet, logger, (payload) => {
    const input = asRecord(payload);
    const mentionHint = input.mentionHint;
    if (mentionHint !== undefined && typeof mentionHint !== 'boolean') {
      throw new AppError('INVALID_ARGUMENT', '偏好项类型不合法。');
    }
    return writePrefs(db, mentionHint === undefined ? {} : { mentionHint: mentionHint as boolean });
  });

  handle(IPC.backupCreate, logger, () => createBackup(db, paths, app.getVersion()));

  handle(IPC.backupList, logger, () => listBackups(paths));

  handle(IPC.backupPick, logger, async () => {
    const window = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0];
    const options = {
      title: '选择备份文件',
      properties: ['openFile' as const],
      filters: [{ name: '文火备份', extensions: ['zip'] }],
      defaultPath: join(paths.root, 'backups'),
    };
    const picked = window
      ? await dialog.showOpenDialog(window, options)
      : await dialog.showOpenDialog(options);
    if (picked.canceled || picked.filePaths.length === 0) return null;
    return picked.filePaths[0] ?? null;
  });

  handle(IPC.backupRestore, logger, (payload) => {
    const zipPath = asString(asRecord(payload).zipPath, '备份文件');
    const result = restoreBackup(db, paths, zipPath);
    logger.info('backup restored, relaunching', { zipPath, safetyCopy: result.safetyCopyPath });

    // 连接已关闭，必须重启；延迟一点让 IPC 回包先送到渲染层
    setTimeout(() => {
      app.relaunch();
      app.exit(0);
    }, 600);

    return {
      fileName: result.filePath,
      projectCount: result.projectCount,
      chapterCount: result.chapterCount,
    };
  });

  handle(
    IPC.backupPruneAuto,
    logger,
    () => pruneAutoBackups(paths, readPrefs(db).autoBackupKeep).length,
  );

  handle(IPC.appInfo, logger, () => ({
    dataDir: paths.root,
    version: app.getVersion(),
    dbBytes: (() => {
      try {
        return statSync(paths.dbFile).size;
      } catch {
        return 0;
      }
    })(),
  }));

  handle(IPC.exportRun, logger, async (payload) => {
    const input = asRecord(payload);
    const projectId = asString(input.projectId, '项目');
    const format = asString(input.format, '导出格式');
    const volumeId = asOptionalString(input.volumeId) ?? undefined;
    if (!isExportKind(format)) throw new AppError('INVALID_ARGUMENT', '导出格式不合法。');

    const project = getProject(db, projectId);
    const window = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0];
    const exportDir = resolveExportDir(db, paths);

    const options = {
      title: '导出' + EXPORT_KIND_LABELS[format],
      defaultPath: join(
        exportDir,
        suggestedFileName(
          volumeId ? await volumeScopedTitle(db, projectId, volumeId) : project.title,
          format,
        ),
      ),
      filters: [{ name: EXPORT_KIND_LABELS[format], extensions: [EXPORT_EXTENSIONS[format]] }],
    };

    const picked = window
      ? await dialog.showSaveDialog(window, options)
      : await dialog.showSaveDialog(options);
    if (picked.canceled || !picked.filePath) return null;

    let result: ExportTxtResult;
    try {
      result = runExport(db, projectId, format, picked.filePath);
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code ?? 'UNKNOWN';
      logger.error('export failed', error, { filePath: picked.filePath, format });
      throw new AppError(
        'EXPORT_FAILED',
        `无法写入 ${picked.filePath}（${code}）。这个位置没有写权限，请改存到 ${exportDir} 后重试。`,
      );
    }

    writeSetting(db, 'lastExportDir', dirname(result.filePath));

    const box = {
      type: 'info' as const,
      title: '导出完成',
      message: EXPORT_KIND_LABELS[format] + ' 已导出',
      detail: `${result.filePath}\n${(result.bytes / 1024).toFixed(1)} KB`,
      buttons: ['打开所在文件夹', '好'],
      defaultId: 1,
      cancelId: 1,
    };
    const choice = window
      ? await dialog.showMessageBox(window, box)
      : await dialog.showMessageBox(box);
    if (choice.response === 0) shell.showItemInFolder(result.filePath);

    return result;
  });
  handle(IPC.snapshotList, logger, (payload) =>
    listSnapshots(db, asString(asRecord(payload).chapterId, '章节')),
  );

  handle(IPC.snapshotCreate, logger, (payload) => {
    const input = asRecord(payload);
    const note = asOptionalString(input.note);
    return createSnapshot(db, {
      chapterId: asString(input.chapterId, '章节'),
      kind: 'manual',
      ...(note !== undefined ? { note } : {}),
    });
  });

  handle(IPC.snapshotGet, logger, (payload) =>
    getSnapshot(db, asString(asRecord(payload).snapshotId, '快照')),
  );

  handle(IPC.snapshotDelete, logger, (payload) => {
    deleteSnapshot(db, asString(asRecord(payload).snapshotId, '快照'));
    return null;
  });

  handle(IPC.snapshotClearLegacy, logger, (payload) =>
    clearLegacyPreRestore(db, asString(asRecord(payload).chapterId, '章节')),
  );

  handle(IPC.snapshotRestore, logger, (payload) =>
    restoreSnapshot(db, asString(asRecord(payload).snapshotId, '快照')),
  );

  handle(IPC.searchQuery, logger, (payload) => {
    const input = asRecord(payload);
    return search(db, {
      projectId: asString(input.projectId, '项目'),
      q: asString(input.q, '关键词'),
    });
  });

  handle(IPC.draftStash, logger, (payload) => {
    const input = asRecord(payload);
    const chapterId = asString(input.chapterId, '章节');
    const plainText = asString(input.plainText, '正文');
    const row = db.prepare('SELECT project_id FROM chapters WHERE id = ?').get(chapterId) as
      { project_id: string } | undefined;
    if (!row) throw new AppError('NOT_FOUND', '章节不存在。');

    stashDraft(paths, {
      chapterId,
      projectId: row.project_id,
      contentJson: asString(input.contentJson, '正文'),
      plainText,
      wordCount: countWords(plainText),
      savedAt: Date.now(),
    });
    return null;
  });

  handle(IPC.draftClear, logger, (payload) => {
    clearDraft(paths, asString(asRecord(payload).chapterId, '章节'));
    return null;
  });

  handle(IPC.recoveryRestore, logger, (payload) =>
    recoverChapter(paths, db, asString(asRecord(payload).chapterId, '章节'), 'restore'),
  );

  handle(IPC.recoveryDiscard, logger, (payload) =>
    recoverChapter(paths, db, asString(asRecord(payload).chapterId, '章节'), 'discard'),
  );

  handle(IPC.appBootstrap, logger, () => ({
    version: app.getVersion(),
    lastProjectId: readLastProjectId(db),
    recoveryCandidates: listRecoveryCandidates(paths, db),
  }));
}

/**
 * 崩溃恢复：
 * - restore：先把库里现版本存成手动快照，再用草稿覆盖，最后清掉草稿；
 * - discard：把草稿本身留成快照（丢弃也可逆），然后清掉草稿。
 */
function recoverChapter(
  paths: AppPaths,
  db: Db,
  chapterId: string,
  mode: 'restore' | 'discard',
): ChapterDetail | null {
  const draft = readDraft(paths, chapterId);
  if (!draft) throw new AppError('NOT_FOUND', '草稿不存在或已被清理。');

  if (mode === 'discard') {
    insertSnapshot(db, {
      chapterId,
      kind: 'manual',
      contentJson: draft.contentJson,
      plainText: draft.plainText,
      wordCount: draft.wordCount,
      note: '崩溃时丢弃的草稿',
    });
    clearDraft(paths, chapterId);
    return null;
  }

  createSnapshot(db, { chapterId, kind: 'manual', note: '崩溃恢复前的版本' });
  saveChapter(db, {
    chapterId,
    contentJson: draft.contentJson,
    plainText: draft.plainText,
  });
  clearDraft(paths, chapterId);
  return getChapter(db, chapterId);
}
/** 按卷导出时文件名带上卷名，避免和整本导出撞名。 */
function volumeScopedTitle(
  db: Db,
  projectId: string,
  projectTitle: string,
  volumeId?: string,
): string {
  if (!volumeId) return projectTitle;
  const row = db
    .prepare('SELECT title FROM volumes WHERE id = ? AND project_id = ?')
    .get(volumeId, projectId) as { title: string } | undefined;
  return row ? projectTitle + '-' + row.title : projectTitle;
}
