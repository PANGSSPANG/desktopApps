import { contextBridge, ipcRenderer } from 'electron';
import { IPC, type WenhuoApi } from '@shared/ipc';
import type { Result } from '@shared/result';
import type {
  AppPrefs,
  AppInfo,
  BackupInfo,
  BootstrapResult,
  ChapterDetail,
  ChapterStatus,
  ChapterSummary,
  CreateProjectInput,
  ExportKind,
  ExportTxtResult,
  EntityDetail,
  EntityInput,
  EntityKind,
  EntitySummary,
  ImportCommitInput,
  ImportCommitResult,
  ImportPreview,
  ProjectSummary,
  SaveChapterInput,
  SaveChapterResult,
  SearchPage,
  SnapshotDetail,
  SnapshotSummary,
  StatsOverview,
  VolumeTree,
} from '@shared/types';
import type { SplitRule } from '@shared/split-chapters';

function invoke<T>(channel: string, ...args: unknown[]): Promise<Result<T>> {
  return ipcRenderer.invoke(channel, ...args) as Promise<Result<T>>;
}

const api: WenhuoApi = {
  project: {
    list: () => invoke<ProjectSummary[]>(IPC.projectList),
    create: (input: CreateProjectInput) => invoke<ProjectSummary>(IPC.projectCreate, input),
    rename: (id: string, title: string) => invoke<void>(IPC.projectRename, { id, title }),
    remove: (id: string) => invoke<void>(IPC.projectDelete, { id }),
    open: (id: string) => invoke<ProjectSummary>(IPC.projectOpen, { id }),
  },
  manuscript: {
    tree: (projectId: string) => invoke<VolumeTree>(IPC.manuscriptTree, { projectId }),
    createVolume: (projectId: string, title: string) =>
      invoke<VolumeTree>(IPC.volumeCreate, { projectId, title }),
    createChapter: (input: { volumeId: string; title?: string }) =>
      invoke<VolumeTree>(IPC.chapterCreate, input),
    deleteVolume: (volumeId: string) => invoke<VolumeTree>(IPC.volumeDelete, { volumeId }),
    moveVolume: (input: { volumeId: string; beforeVolumeId: string | null }) =>
      invoke<VolumeTree>(IPC.volumeMove, input),
    moveChapter: (input: {
      chapterId: string;
      targetVolumeId: string;
      beforeChapterId: string | null;
    }) => invoke<VolumeTree>(IPC.chapterMove, input),
    renameChapter: (chapterId: string, title: string) =>
      invoke<void>(IPC.chapterRename, { chapterId, title }),
    deleteChapter: (chapterId: string) => invoke<VolumeTree>(IPC.chapterDelete, { chapterId }),
  },
  chapter: {
    get: (chapterId: string) => invoke<ChapterDetail>(IPC.chapterGet, { chapterId }),
    save: (input: SaveChapterInput) => invoke<SaveChapterResult>(IPC.chapterSave, input),
    patch: (input: { chapterId: string; status?: ChapterStatus; synopsis?: string }) =>
      invoke<ChapterSummary>(IPC.chapterPatch, input),
  },
  stats: {
    overview: (projectId: string) => invoke<StatsOverview>(IPC.statsOverview, { projectId }),
  },
  world: {
    list: (projectId: string, kind?: EntityKind) =>
      invoke<EntitySummary[]>(IPC.worldList, { projectId, kind }),
    get: (entityId: string) => invoke<EntityDetail>(IPC.worldGet, { entityId }),
    save: (input: EntityInput) => invoke<EntityDetail>(IPC.worldSave, input),
    remove: (entityId: string) => invoke<void>(IPC.worldDelete, { entityId }),
    forChapter: (chapterId: string) => invoke<EntitySummary[]>(IPC.worldForChapter, { chapterId }),
    link: (chapterId: string, entityId: string) =>
      invoke<EntitySummary[]>(IPC.worldLink, { chapterId, entityId }),
    unlink: (chapterId: string, entityId: string) =>
      invoke<EntitySummary[]>(IPC.worldUnlink, { chapterId, entityId }),
    backlinks: (entityId: string) =>
      invoke<{ id: string; title: string }[]>(IPC.worldBacklinks, { entityId }),
  },
  importer: {
    pickFile: () => invoke<string | null>(IPC.importPick),
    preview: (input: { filePath: string; rule: SplitRule }) =>
      invoke<ImportPreview>(IPC.importPreview, input),
    commit: (input: ImportCommitInput) => invoke<ImportCommitResult>(IPC.importCommit, input),
  },
  prefs: {
    get: () => invoke<AppPrefs>(IPC.prefsGet),
    set: (prefs: Partial<AppPrefs>) => invoke<AppPrefs>(IPC.prefsSet, prefs),
  },
  backup: {
    create: () => invoke<BackupInfo>(IPC.backupCreate),
    list: () => invoke<BackupInfo[]>(IPC.backupList),
    pruneAuto: () => invoke<number>(IPC.backupPruneAuto),
    pickFile: () => invoke<string | null>(IPC.backupPick),
    restore: (zipPath: string) =>
      invoke<{ fileName: string; projectCount: number; chapterCount: number }>(IPC.backupRestore, {
        zipPath,
      }),
  },
  exporter: {
    run: (projectId: string, format: ExportKind, volumeId?: string) =>
      invoke<ExportTxtResult | null>(IPC.exportRun, { projectId, format, volumeId }),
  },
  snapshot: {
    list: (chapterId: string) => invoke<SnapshotSummary[]>(IPC.snapshotList, { chapterId }),
    create: (input: { chapterId: string; note?: string }) =>
      invoke<SnapshotSummary>(IPC.snapshotCreate, input),
    get: (snapshotId: string) => invoke<SnapshotDetail>(IPC.snapshotGet, { snapshotId }),
    remove: (snapshotId: string) => invoke<void>(IPC.snapshotDelete, { snapshotId }),
    clearLegacy: (chapterId: string) => invoke<number>(IPC.snapshotClearLegacy, { chapterId }),
    restore: (snapshotId: string) => invoke<ChapterDetail>(IPC.snapshotRestore, { snapshotId }),
  },
  search: {
    query: (input: { projectId: string; q: string }) => invoke<SearchPage>(IPC.searchQuery, input),
  },
  draft: {
    stash: (input: { chapterId: string; contentJson: string; plainText: string }) =>
      invoke<void>(IPC.draftStash, input),
    clear: (chapterId: string) => invoke<void>(IPC.draftClear, { chapterId }),
  },
  recovery: {
    restore: (chapterId: string) => invoke<ChapterDetail>(IPC.recoveryRestore, { chapterId }),
    discard: (chapterId: string) => invoke<void>(IPC.recoveryDiscard, { chapterId }),
  },
  app: {
    bootstrap: () => invoke<BootstrapResult>(IPC.appBootstrap),
    info: () => invoke<AppInfo>(IPC.appInfo),
  },
};

contextBridge.exposeInMainWorld('api', api);
