import { create } from 'zustand';
import type { Genre } from '@shared/project-type';
import type {
  ChapterDetail,
  ChapterStatus,
  ProjectSummary,
  AppPrefs,
  EntityDetail,
  EntityInput,
  EntityKind,
  EntitySummary,
  RecoveryCandidate,
  SearchHit,
  SearchPage,
  SnapshotDetail,
  SnapshotSummary,
  StatsOverview,
  VolumeTree,
} from '@shared/types';
import { findMentionCandidates } from '@shared/mention';
import { api, errorMessage, unwrap } from '@renderer/api';
import { flushEditor } from '@renderer/lib/editor-bridge';

export type SaveState = 'idle' | 'dirty' | 'saving' | 'saved' | 'error';

export interface ConfirmState {
  message: string;
  confirmText: string;
  danger: boolean;
}

/** 原生 window.confirm 关闭后会让 Electron 丢失键盘焦点，统一改用应用内弹窗。 */
let confirmResolver: ((ok: boolean) => void) | null = null;

interface WorkspaceState {
  projects: ProjectSummary[];
  project: ProjectSummary | null;
  tree: VolumeTree | null;
  chapter: ChapterDetail | null;
  stats: StatsOverview | null;
  saveState: SaveState;
  savedAt: number | null;
  error: string | null;
  loading: boolean;

  snapshots: SnapshotSummary[];
  snapshotPreview: SnapshotDetail | null;
  /** 快照恢复后递增：让编辑器重新挂载并载入旧内容 */
  editorEpoch: number;

  searchOpen: boolean;
  searchPage: SearchPage | null;
  searchTarget: { chapterId: string; query: string; occurrence: number; nonce: number } | null;

  recovery: RecoveryCandidate[];
  entities: EntitySummary[];
  chapterEntities: EntitySummary[];
  entityKind: EntityKind | 'all';
  editingEntity: EntityDetail | null;
  entityEditorOpen: boolean;
  entityDraftKind: EntityKind;
  prefs: AppPrefs;
  allEntities: EntitySummary[];
  mentionCandidates: EntitySummary[];
  confirmState: ConfirmState | null;

  bootstrap(): Promise<void>;
  loadProjects(): Promise<void>;
  createProject(input: { title: string; author?: string; genre: Genre }): Promise<void>;
  openProject(projectId: string): Promise<void>;
  closeProject(): void;
  selectChapter(chapterId: string): Promise<void>;
  refreshTree(): Promise<void>;
  refreshStats(): Promise<void>;
  addVolume(): Promise<void>;
  moveChapter(
    chapterId: string,
    targetVolumeId: string,
    beforeChapterId: string | null,
  ): Promise<void>;
  removeProject(projectId: string): Promise<void>;
  removeChapter(chapterId: string): Promise<void>;
  removeVolume(volumeId: string): Promise<void>;
  moveVolume(volumeId: string, beforeVolumeId: string | null): Promise<void>;
  renameProject(projectId: string, title: string): Promise<void>;
  addChapter(volumeId: string): Promise<void>;
  setSaveState(state: SaveState): void;
  markSaved(savedAt: number, wordCount: number): void;
  updateChapterMeta(patch: { status?: ChapterStatus; synopsis?: string }): Promise<void>;
  clearError(): void;

  loadSnapshots(chapterId?: string): Promise<void>;
  createSnapshot(note?: string): Promise<void>;
  previewSnapshot(snapshotId: string): Promise<void>;
  closeSnapshotPreview(): void;
  restoreSnapshot(snapshotId: string): Promise<void>;
  removeSnapshot(snapshotId: string): Promise<void>;
  clearLegacySnapshots(): Promise<void>;

  openSearch(): void;
  closeSearch(): void;
  runSearch(query: string): Promise<void>;
  jumpToHit(hit: SearchHit): Promise<void>;

  recoverDraft(chapterId: string): Promise<void>;
  discardDraft(chapterId: string): Promise<void>;
  requestConfirm(
    message: string,
    options?: { confirmText?: string; danger?: boolean },
  ): Promise<boolean>;
  resolveConfirm(ok: boolean): void;
  notify(message: string): void;
  setEntityKind(kind: EntityKind | 'all'): void;
  loadEntities(): Promise<void>;
  openEntity(entityId: string | null, draftKind?: EntityKind): Promise<void>;
  closeEntity(): void;
  saveEntity(input: EntityInput): Promise<void>;
  deleteEditingEntity(): Promise<void>;
  loadChapterEntities(chapterId?: string): Promise<void>;
  linkEntity(entityId: string): Promise<void>;
  unlinkEntity(entityId: string): Promise<void>;
  loadPrefs(): Promise<void>;
  setMentionHint(enabled: boolean): Promise<void>;
  setAutoBackup(enabled: boolean): Promise<void>;
  setTypewriter(enabled: boolean): Promise<void>;
  setAutoBackupKeep(keep: number): Promise<void>;
  loadAllEntities(): Promise<void>;
  detectMentions(text: string): void;
}

export const useWorkspace = create<WorkspaceState>((set, get) => ({
  projects: [],
  project: null,
  tree: null,
  chapter: null,
  stats: null,
  saveState: 'idle',
  savedAt: null,
  prefs: { mentionHint: false, autoBackup: true, autoBackupKeep: 7, typewriter: false },
  error: null,
  loading: false,

  snapshots: [],
  snapshotPreview: null,
  editorEpoch: 0,

  searchOpen: false,
  searchPage: null,
  searchTarget: null,

  recovery: [],
  confirmState: null,
  entities: [],
  chapterEntities: [],
  entityKind: 'all',
  editingEntity: null,
  entityEditorOpen: false,
  entityDraftKind: 'character',

  allEntities: [],
  mentionCandidates: [],

  async bootstrap() {
    await get().loadPrefs();
    await get().loadProjects();
    const boot = unwrap(await api.app.bootstrap());
    set({ recovery: boot.recoveryCandidates });
    if (boot.lastProjectId) {
      const stillExists = get().projects.some((project) => project.id === boot.lastProjectId);
      if (stillExists) await get().openProject(boot.lastProjectId);
    }
  },

  async loadProjects() {
    set({ loading: true });
    try {
      set({ projects: unwrap(await api.project.list()), error: null });
    } catch (error) {
      set({ error: errorMessage(error) });
    } finally {
      set({ loading: false });
    }
  },

  async createProject(input) {
    try {
      const project = unwrap(await api.project.create(input));
      await get().loadProjects();
      await get().openProject(project.id);
    } catch (error) {
      set({ error: errorMessage(error) });
    }
  },

  async openProject(projectId) {
    set({ loading: true, saveState: 'idle', savedAt: null, snapshots: [] });
    try {
      const project = unwrap(await api.project.open(projectId));
      const tree = unwrap(await api.manuscript.tree(projectId));
      const firstChapter = tree.volumes[0]?.chapters[0];
      const chapter = firstChapter ? unwrap(await api.chapter.get(firstChapter.id)) : null;
      set({ project, tree, chapter, error: null, loading: false });
      await get().refreshStats();
      await get().loadEntities();
      await get().loadAllEntities();
      if (chapter) {
        await get().loadSnapshots(chapter.id);
        await get().loadChapterEntities(chapter.id);
      }
    } catch (error) {
      set({ error: errorMessage(error), loading: false });
    }
  },

  closeProject() {
    set({
      project: null,
      tree: null,
      chapter: null,
      stats: null,
      saveState: 'idle',
      savedAt: null,
      snapshots: [],
      snapshotPreview: null,
      chapterEntities: [],
      editingEntity: null,
      searchOpen: false,
      searchPage: null,
    });
    void get().loadProjects();
  },

  async selectChapter(chapterId) {
    try {
      const chapter = unwrap(await api.chapter.get(chapterId));
      set({
        chapter,
        saveState: 'idle',
        savedAt: null,
        error: null,
        snapshotPreview: null,
        snapshots: [],
      });
      await get().loadSnapshots(chapterId);
      await get().loadChapterEntities(chapterId);
      set({ mentionCandidates: [] });
    } catch (error) {
      set({ error: errorMessage(error) });
    }
  },

  async refreshTree() {
    const project = get().project;
    if (!project) return;
    try {
      set({ tree: unwrap(await api.manuscript.tree(project.id)) });
    } catch (error) {
      set({ error: errorMessage(error) });
    }
  },

  async refreshStats() {
    const project = get().project;
    if (!project) return;
    try {
      set({ stats: unwrap(await api.stats.overview(project.id)) });
    } catch (error) {
      set({ error: errorMessage(error) });
    }
  },

  async removeProject(projectId) {
    const title = get().projects.find((item) => item.id === projectId)?.title ?? '';
    const ok = await get().requestConfirm(
      '删除项目「' + title + '」？\n书稿、章节、快照会一并删除，无法找回；建议先「备份」。',
      { confirmText: '删除项目', danger: true },
    );
    if (!ok) return;
    try {
      unwrap(await api.project.remove(projectId));
      if (get().project?.id === projectId) {
        set({ project: null, tree: null, chapter: null, stats: null, snapshots: [] });
      }
      await get().loadProjects();
    } catch (error) {
      set({ error: errorMessage(error) });
    }
  },

  async removeChapter(chapterId) {
    const ok = await get().requestConfirm('删除这一章？它的快照会一并删除，无法找回。', {
      confirmText: '删除',
      danger: true,
    });
    if (!ok) return;
    try {
      const tree = unwrap(await api.manuscript.deleteChapter(chapterId));
      set({ tree });
      const stillExists = tree.volumes.some((volume) =>
        volume.chapters.some((item) => item.id === get().chapter?.id),
      );
      if (!stillExists) {
        const first = tree.volumes.flatMap((volume) => volume.chapters)[0];
        if (first) await get().selectChapter(first.id);
        else set({ chapter: null, snapshots: [], chapterEntities: [], mentionCandidates: [] });
      }
      await get().refreshStats();
    } catch (error) {
      set({ error: errorMessage(error) });
    }
  },

  async removeVolume(volumeId) {
    const volume = get().tree?.volumes.find((item) => item.id === volumeId);
    const count = volume?.chapters.length ?? 0;
    const ok = await get().requestConfirm(
      '删除卷「' + (volume?.title ?? '') + '」？其中 ' + count + ' 章会一并删除，无法找回。',
      { confirmText: '删除卷', danger: true },
    );
    if (!ok) return;
    try {
      const tree = unwrap(await api.manuscript.deleteVolume(volumeId));
      set({ tree });
      const stillExists = tree.volumes.some((item) => item.id === volumeId);
      const first = tree.volumes.flatMap((item) => item.chapters)[0];
      if (!stillExists && first) await get().selectChapter(first.id);
      if (tree.volumes.length === 0) {
        set({ chapter: null, snapshots: [], chapterEntities: [] });
      }
      await get().refreshStats();
    } catch (error) {
      set({ error: errorMessage(error) });
    }
  },

  async moveChapter(chapterId, targetVolumeId, beforeChapterId) {
    try {
      const tree = unwrap(
        await api.manuscript.moveChapter({ chapterId, targetVolumeId, beforeChapterId }),
      );
      set({ tree });
    } catch (error) {
      set({ error: errorMessage(error) });
    }
  },

  async moveVolume(volumeId: string, beforeVolumeId: string | null) {
    try {
      const tree = unwrap(await api.manuscript.moveVolume({ volumeId, beforeVolumeId }));
      set({ tree });
    } catch (error) {
      set({ error: errorMessage(error) });
    }
  },

  async renameProject(projectId: string, title: string) {
    const trimmed = title.trim();
    if (!trimmed) return;
    try {
      unwrap(await api.project.rename(projectId, trimmed));
      await get().loadProjects();
      const current = get().project;
      if (current?.id === projectId) set({ project: { ...current, title: trimmed } });
    } catch (error) {
      set({ error: errorMessage(error) });
    }
  },

  async addVolume() {
    const project = get().project;
    if (!project) return;
    try {
      const tree = unwrap(await api.manuscript.createVolume(project.id, ''));
      set({ tree });
    } catch (error) {
      set({ error: errorMessage(error) });
    }
  },

  async addChapter(volumeId) {
    try {
      const tree = unwrap(await api.manuscript.createChapter({ volumeId }));
      set({ tree });
      const created = tree.volumes.flatMap((volume) => volume.chapters).at(-1);
      if (created) await get().selectChapter(created.id);
    } catch (error) {
      set({ error: errorMessage(error) });
    }
  },

  setSaveState(state) {
    set({ saveState: state });
  },

  markSaved(savedAt, wordCount) {
    const chapter = get().chapter;
    const tree = get().tree;
    set({
      savedAt,
      saveState: 'saved',
      chapter: chapter ? { ...chapter, wordCount, updatedAt: savedAt } : null,
      tree: tree
        ? {
            ...tree,
            volumes: tree.volumes.map((volume) => ({
              ...volume,
              chapters: volume.chapters.map((item) =>
                chapter && item.id === chapter.id ? { ...item, wordCount } : item,
              ),
            })),
          }
        : null,
    });
    void get().refreshStats();
  },

  async updateChapterMeta(patch) {
    const chapter = get().chapter;
    if (!chapter) return;
    try {
      const updated = unwrap(await api.chapter.patch({ chapterId: chapter.id, ...patch }));
      set({ chapter: { ...chapter, status: updated.status, synopsis: updated.synopsis } });
      await get().refreshTree();
    } catch (error) {
      set({ error: errorMessage(error) });
    }
  },

  clearError() {
    set({ error: null });
  },

  async loadSnapshots(chapterId) {
    const id = chapterId ?? get().chapter?.id;
    if (!id) {
      set({ snapshots: [] });
      return;
    }
    try {
      set({ snapshots: unwrap(await api.snapshot.list(id)) });
    } catch (error) {
      set({ error: errorMessage(error) });
    }
  },

  async createSnapshot(note) {
    const chapter = get().chapter;
    if (!chapter) return;
    try {
      unwrap(await api.snapshot.create({ chapterId: chapter.id, ...(note ? { note } : {}) }));
      await get().loadSnapshots(chapter.id);
    } catch (error) {
      set({ error: errorMessage(error) });
    }
  },

  async previewSnapshot(snapshotId) {
    try {
      set({ snapshotPreview: unwrap(await api.snapshot.get(snapshotId)) });
    } catch (error) {
      set({ error: errorMessage(error) });
    }
  },

  closeSnapshotPreview() {
    set({ snapshotPreview: null });
  },

  async restoreSnapshot(snapshotId) {
    const chapter = get().chapter;
    if (!chapter) return;
    try {
      // 先落盘当前改动，避免自动保存计时器在恢复之后把旧版覆盖回去
      await flushEditor();
      const restored = unwrap(await api.snapshot.restore(snapshotId));
      set({
        chapter: restored,
        snapshotPreview: null,
        saveState: 'saved',
        savedAt: restored.updatedAt,
        editorEpoch: get().editorEpoch + 1,
      });
      await get().refreshTree();
      await get().refreshStats();
      await get().loadSnapshots(restored.id);
    } catch (error) {
      set({ error: errorMessage(error) });
    }
  },

  async removeSnapshot(snapshotId) {
    const chapter = get().chapter;
    if (!chapter) return;
    try {
      unwrap(await api.snapshot.remove(snapshotId));
      if (get().snapshotPreview?.id === snapshotId) set({ snapshotPreview: null });
      await get().loadSnapshots(chapter.id);
    } catch (error) {
      set({ error: errorMessage(error) });
    }
  },

  async clearLegacySnapshots() {
    const chapter = get().chapter;
    if (!chapter) return;
    try {
      unwrap(await api.snapshot.clearLegacy(chapter.id));
      await get().loadSnapshots(chapter.id);
    } catch (error) {
      set({ error: errorMessage(error) });
    }
  },

  setEntityKind(kind) {
    set({ entityKind: kind });
    void get().loadEntities();
  },

  async loadEntities() {
    const project = get().project;
    if (!project) return;
    try {
      const kind = get().entityKind;
      const list = unwrap(await api.world.list(project.id, kind === 'all' ? undefined : kind));
      set({ entities: list });
    } catch (error) {
      set({ error: errorMessage(error) });
    }
  },

  async openEntity(entityId, draftKind) {
    if (!entityId) {
      set({
        editingEntity: null,
        entityDraftKind: draftKind ?? 'character',
        entityEditorOpen: true,
      });
      return;
    }
    try {
      set({ editingEntity: unwrap(await api.world.get(entityId)), entityEditorOpen: true });
    } catch (error) {
      set({ error: errorMessage(error) });
    }
  },

  closeEntity() {
    set({ editingEntity: null, entityEditorOpen: false });
  },

  async saveEntity(input) {
    try {
      const saved = unwrap(await api.world.save(input));
      // 保存后不关闭弹窗：切回「查看」让用户确认结果
      set({ editingEntity: saved, entityEditorOpen: true });
      await get().loadEntities();
      await get().loadAllEntities();
      if (get().chapter) await get().loadChapterEntities();
    } catch (error) {
      set({ error: errorMessage(error) });
    }
  },

  async deleteEditingEntity() {
    const entity = get().editingEntity;
    if (!entity) return;
    const ok = await get().requestConfirm(
      '删除设定卡「' + entity.name + '」？与章节的关联会一并清理。',
      { confirmText: '删除', danger: true },
    );
    if (!ok) return;
    try {
      unwrap(await api.world.remove(entity.id));
      set({ editingEntity: null, entityEditorOpen: false });
      await get().loadEntities();
      await get().loadAllEntities();
      if (get().chapter) await get().loadChapterEntities();
    } catch (error) {
      set({ error: errorMessage(error) });
    }
  },

  async loadChapterEntities(chapterId) {
    const id = chapterId ?? get().chapter?.id;
    if (!id) {
      set({ chapterEntities: [] });
      return;
    }
    try {
      set({ chapterEntities: unwrap(await api.world.forChapter(id)) });
    } catch (error) {
      set({ error: errorMessage(error) });
    }
  },

  async linkEntity(entityId) {
    const chapter = get().chapter;
    if (!chapter) return;
    try {
      set({ chapterEntities: unwrap(await api.world.link(chapter.id, entityId)) });
      await get().loadEntities();
      await get().loadAllEntities();
      set({ mentionCandidates: get().mentionCandidates.filter((item) => item.id !== entityId) });
    } catch (error) {
      set({ error: errorMessage(error) });
    }
  },

  async unlinkEntity(entityId) {
    const chapter = get().chapter;
    if (!chapter) return;
    try {
      set({ chapterEntities: unwrap(await api.world.unlink(chapter.id, entityId)) });
      await get().loadEntities();
    } catch (error) {
      set({ error: errorMessage(error) });
    }
  },

  async loadPrefs() {
    try {
      set({ prefs: unwrap(await api.prefs.get()) });
    } catch {
      // 偏好读取失败不影响写作，用默认值即可
    }
  },

  async setTypewriter(enabled) {
    set({ prefs: unwrap(await api.prefs.set({ typewriter: enabled })) });
  },

  async setAutoBackup(enabled) {
    set({ prefs: unwrap(await api.prefs.set({ autoBackup: enabled })) });
  },

  async setAutoBackupKeep(keep) {
    set({ prefs: unwrap(await api.prefs.set({ autoBackupKeep: keep })) });
  },

  async setMentionHint(enabled) {
    try {
      set({ prefs: unwrap(await api.prefs.set({ mentionHint: enabled })) });
      if (!enabled) set({ mentionCandidates: [] });
    } catch (error) {
      set({ error: errorMessage(error) });
    }
  },

  async loadAllEntities() {
    const project = get().project;
    if (!project) return;
    try {
      set({ allEntities: unwrap(await api.world.list(project.id)) });
    } catch {
      // 列表失败不影响章节编辑
    }
  },

  detectMentions(text) {
    if (!get().prefs.mentionHint) {
      if (get().mentionCandidates.length > 0) set({ mentionCandidates: [] });
      return;
    }
    const linked = new Set(get().chapterEntities.map((entity) => entity.id));
    set({ mentionCandidates: findMentionCandidates(text, get().allEntities, linked) });
  },

  openSearch() {
    set({ searchOpen: true, searchPage: null });
  },

  closeSearch() {
    set({ searchOpen: false, searchPage: null });
  },

  async jumpToHit(hit) {
    const query = get().searchPage?.query ?? '';
    set({
      searchOpen: false,
      searchPage: null,
      searchTarget: {
        chapterId: hit.refId,
        query,
        occurrence: hit.occurrence,
        nonce: Date.now(),
      },
    });
    await get().selectChapter(hit.refId);
  },

  async runSearch(query) {
    const project = get().project;
    if (!project) return;
    if (!query.trim()) {
      set({ searchPage: null });
      return;
    }
    try {
      set({ searchPage: unwrap(await api.search.query({ projectId: project.id, q: query })) });
    } catch (error) {
      set({ error: errorMessage(error) });
    }
  },

  async recoverDraft(chapterId) {
    try {
      const chapter = unwrap(await api.recovery.restore(chapterId));
      set({
        recovery: get().recovery.filter((item) => item.chapterId !== chapterId),
        chapter,
        editorEpoch: get().editorEpoch + 1,
        saveState: 'saved',
        savedAt: chapter.updatedAt,
      });
      const project = get().project;
      if (project && project.id !== chapter.projectId) {
        await get().openProject(chapter.projectId);
      } else {
        await get().loadSnapshots(chapter.id);
        await get().refreshTree();
        await get().refreshStats();
      }
    } catch (error) {
      set({ error: errorMessage(error) });
    }
  },

  requestConfirm(message, options) {
    set({
      confirmState: {
        message,
        confirmText: options?.confirmText ?? '确定',
        danger: options?.danger ?? false,
      },
    });
    return new Promise<boolean>((resolve) => {
      confirmResolver = resolve;
    });
  },

  resolveConfirm(ok) {
    confirmResolver?.(ok);
    confirmResolver = null;
    set({ confirmState: null });
  },

  notify(message) {
    set({ error: message });
  },

  async discardDraft(chapterId) {
    try {
      unwrap(await api.recovery.discard(chapterId));
      set({ recovery: get().recovery.filter((item) => item.chapterId !== chapterId) });
    } catch (error) {
      set({ error: errorMessage(error) });
    }
  },
}));
