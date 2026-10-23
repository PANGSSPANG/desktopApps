import type { Result } from './result';
import type {
  AppInfo,
  AppPrefs,
  BackupInfo,
  BootstrapResult,
  ChapterDetail,
  ChapterSummary,
  ChapterStatus,
  CreateProjectInput,
  EntityDetail,
  EntityInput,
  EntityKind,
  EntitySummary,
  ExportKind,
  ExportTxtResult,
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
} from './types';
import type { SplitRule } from './split-chapters';

/** IPC 通道常量：主进程注册与预加载调用共用同一份，避免拼写漂移。 */
export const IPC = {
  projectList: 'project:list',
  projectCreate: 'project:create',
  projectRename: 'project:rename',
  projectDelete: 'project:delete',
  projectOpen: 'project:open',
  manuscriptTree: 'manuscript:tree',
  volumeCreate: 'volume:create',
  volumeDelete: 'volume:delete',
  volumeMove: 'volume:move',
  chapterCreate: 'chapter:create',
  chapterGet: 'chapter:get',
  chapterSave: 'chapter:save',
  chapterPatch: 'chapter:patch',
  chapterMove: 'chapter:move',
  chapterRename: 'chapter:rename',
  chapterDelete: 'chapter:delete',
  statsOverview: 'stats:overview',
  exportRun: 'export:run',
  prefsGet: 'prefs:get',
  prefsSet: 'prefs:set',
  appInfo: 'app:info',
  backupCreate: 'backup:create',
  backupList: 'backup:list',
  backupPick: 'backup:pick',
  backupRestore: 'backup:restore',
  backupPruneAuto: 'backup:prune-auto',
  appBootstrap: 'app:bootstrap',
  worldList: 'world:list',
  worldGet: 'world:get',
  worldSave: 'world:save',
  worldDelete: 'world:delete',
  worldForChapter: 'world:for-chapter',
  worldLink: 'world:link',
  worldUnlink: 'world:unlink',
  worldBacklinks: 'world:backlinks',
  importPick: 'import:pick',
  importPreview: 'import:preview',
  importCommit: 'import:commit',
  snapshotList: 'snapshot:list',
  snapshotCreate: 'snapshot:create',
  snapshotGet: 'snapshot:get',
  snapshotDelete: 'snapshot:delete',
  snapshotClearLegacy: 'snapshot:clear-legacy',
  snapshotRestore: 'snapshot:restore',
  searchQuery: 'search:query',
  draftStash: 'draft:stash',
  draftClear: 'draft:clear',
  recoveryRestore: 'recovery:restore',
  recoveryDiscard: 'recovery:discard',
} as const;

export interface WenhuoApi {
  project: {
    list(): Promise<Result<ProjectSummary[]>>;
    create(input: CreateProjectInput): Promise<Result<ProjectSummary>>;
    rename(id: string, title: string): Promise<Result<void>>;
    remove(id: string): Promise<Result<void>>;
    open(id: string): Promise<Result<ProjectSummary>>;
  };
  manuscript: {
    tree(projectId: string): Promise<Result<VolumeTree>>;
    createVolume(projectId: string, title: string): Promise<Result<VolumeTree>>;
    createChapter(input: { volumeId: string; title?: string }): Promise<Result<VolumeTree>>;
    deleteVolume(volumeId: string): Promise<Result<VolumeTree>>;
    moveVolume(input: {
      volumeId: string;
      beforeVolumeId: string | null;
    }): Promise<Result<VolumeTree>>;
    moveChapter(input: {
      chapterId: string;
      targetVolumeId: string;
      beforeChapterId: string | null;
    }): Promise<Result<VolumeTree>>;
    renameChapter(chapterId: string, title: string): Promise<Result<void>>;
    deleteChapter(chapterId: string): Promise<Result<VolumeTree>>;
  };
  chapter: {
    get(chapterId: string): Promise<Result<ChapterDetail>>;
    save(input: SaveChapterInput): Promise<Result<SaveChapterResult>>;
    patch(input: {
      chapterId: string;
      status?: ChapterStatus;
      synopsis?: string;
    }): Promise<Result<ChapterSummary>>;
  };
  stats: {
    overview(projectId: string): Promise<Result<StatsOverview>>;
  };
  snapshot: {
    list(chapterId: string): Promise<Result<SnapshotSummary[]>>;
    create(input: { chapterId: string; note?: string }): Promise<Result<SnapshotSummary>>;
    get(snapshotId: string): Promise<Result<SnapshotDetail>>;
    remove(snapshotId: string): Promise<Result<void>>;
    clearLegacy(chapterId: string): Promise<Result<number>>;
    restore(snapshotId: string): Promise<Result<ChapterDetail>>;
  };
  search: {
    query(input: { projectId: string; q: string }): Promise<Result<SearchPage>>;
  };
  draft: {
    stash(input: {
      chapterId: string;
      contentJson: string;
      plainText: string;
    }): Promise<Result<void>>;
    clear(chapterId: string): Promise<Result<void>>;
  };
  recovery: {
    restore(chapterId: string): Promise<Result<ChapterDetail>>;
    discard(chapterId: string): Promise<Result<void>>;
  };
  world: {
    list(projectId: string, kind?: EntityKind): Promise<Result<EntitySummary[]>>;
    get(entityId: string): Promise<Result<EntityDetail>>;
    save(input: EntityInput): Promise<Result<EntityDetail>>;
    remove(entityId: string): Promise<Result<void>>;
    forChapter(chapterId: string): Promise<Result<EntitySummary[]>>;
    link(chapterId: string, entityId: string): Promise<Result<EntitySummary[]>>;
    unlink(chapterId: string, entityId: string): Promise<Result<EntitySummary[]>>;
    backlinks(entityId: string): Promise<Result<{ id: string; title: string }[]>>;
  };
  importer: {
    pickFile(): Promise<Result<string | null>>;
    preview(input: { filePath: string; rule: SplitRule }): Promise<Result<ImportPreview>>;
    commit(input: ImportCommitInput): Promise<Result<ImportCommitResult>>;
  };
  prefs: {
    get(): Promise<Result<AppPrefs>>;
    set(prefs: Partial<AppPrefs>): Promise<Result<AppPrefs>>;
  };
  backup: {
    create(): Promise<Result<BackupInfo>>;
    list(): Promise<Result<BackupInfo[]>>;
    pruneAuto(): Promise<Result<number>>;
    pickFile(): Promise<Result<string | null>>;
    restore(
      zipPath: string,
    ): Promise<Result<{ fileName: string; projectCount: number; chapterCount: number }>>;
  };
  exporter: {
    run(
      projectId: string,
      format: ExportKind,
      volumeId?: string,
    ): Promise<Result<ExportTxtResult | null>>;
  };
  app: {
    bootstrap(): Promise<Result<BootstrapResult>>;
    info(): Promise<Result<AppInfo>>;
  };
}
