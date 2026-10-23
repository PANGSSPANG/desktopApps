import type { SplitChapter, SplitRule } from './split-chapters';
import type { Genre } from './project-type';

export type ChapterStatus = 'draft' | 'revising' | 'done';

/** 完成 = 只读锁定；草稿/修改中都按「可编辑」处理。 */
export function isChapterLocked(status: ChapterStatus): boolean {
  return status === 'done';
}

export const CHAPTER_STATUS_LABELS: Record<ChapterStatus, string> = {
  draft: '草稿',
  revising: '修改中',
  done: '完成',
};

export interface ProjectSummary {
  id: string;
  title: string;
  author: string;
  genre: Genre;
  synopsis: string;
  targetWords: number;
  dailyGoal: number;
  totalWords: number;
  chapterCount: number;
  progress: number;
  createdAt: number;
  updatedAt: number;
}

export interface Volume {
  id: string;
  projectId: string;
  title: string;
  sortOrder: number;
}

export interface ChapterSummary {
  id: string;
  /** 按排序位置派生的章号（1 起），拖拽或删章后自动重排 */
  number: number;
  projectId: string;
  volumeId: string;
  title: string;
  status: ChapterStatus;
  synopsis: string;
  wordCount: number;
  sortOrder: number;
  updatedAt: number;
}

export interface ChapterDetail extends ChapterSummary {
  /** ProseMirror JSON，字符串形式存库，渲染层解析后交给编辑器 */
  contentJson: string;
}

export interface VolumeNode extends Volume {
  chapters: ChapterSummary[];
}

export interface VolumeTree {
  projectId: string;
  volumes: VolumeNode[];
}

export interface StatsOverview {
  projectId: string;
  totalWords: number;
  todayWords: number;
  dailyGoal: number;
  streak: number;
  chapterCount: number;
  doneCount: number;
}

export interface SaveChapterInput {
  chapterId: string;
  contentJson: string;
  plainText: string;
  /** 乐观并发：库中 hash 与此不一致时拒绝覆盖 */
  baseHash?: string;
}

export interface SaveChapterResult {
  chapterId: string;
  wordCount: number;
  savedAt: number;
  sessionWords: number;
  contentHash: string;
}

export interface CreateProjectInput {
  title: string;
  author?: string;
  genre: Genre;
  targetWords?: number;
  dailyGoal?: number;
  synopsis?: string;
}

export interface ExportTxtResult {
  filePath: string;
  bytes: number;
}

export interface BootstrapResult {
  version: string;
  lastProjectId: string | null;
  /** 启动时发现的未保存草稿（崩溃恢复候选） */
  recoveryCandidates: RecoveryCandidate[];
}

export type SnapshotKind = 'manual' | 'auto' | 'pre_restore';

export interface SnapshotSummary {
  id: string;
  chapterId: string;
  kind: SnapshotKind;
  wordCount: number;
  note: string;
  createdAt: number;
}

export interface SnapshotDetail extends SnapshotSummary {
  contentJson: string;
  plainText: string;
}

export type SearchRefType = 'chapter' | 'entity';

export interface SearchHit {
  /** 逐处命中的唯一键：refType:refId:occurrence */
  id: string;
  refType: SearchRefType;
  refId: string;
  title: string;
  /** 命中上下文，高亮用 [[ ]] 包裹 */
  context: string;
  /** 该命中是本章第几处（0 起） */
  occurrence: number;
  score: number;
}

export interface SearchPage {
  query: string;
  chapters: SearchHit[];
  entities: SearchHit[];
}

export interface RecoveryCandidate {
  chapterId: string;
  chapterTitle: string;
  projectId: string;
  savedAt: number;
  wordCount: number;
}

export interface ImportPreview {
  filePath: string;
  suggestedTitle: string;
  rule: SplitRule;
  totalChars: number;
  chapters: SplitChapter[];
  warnings: string[];
}

export interface ImportCommitInput {
  projectId?: string;
  projectTitle?: string;
  volumeTitle?: string;
  chapters: SplitChapter[];
}

export interface ImportCommitResult {
  projectId: string;
  volumeId: string;
  imported: number;
  tree: VolumeTree;
}

export type EntityKind = 'character' | 'location' | 'organization' | 'item';

export const ENTITY_KIND_LABELS: Record<EntityKind, string> = {
  character: '人物',
  location: '地点',
  organization: '组织',
  item: '物品',
};

export interface EntitySummary {
  id: string;
  projectId: string;
  kind: EntityKind;
  name: string;
  alias: string;
  role: string;
  chapterCount: number;
  updatedAt: number;
}

export interface EntityDetail extends EntitySummary {
  description: string;
  relations: string;
  chapters: { id: string; title: string }[];
}

export interface EntityInput {
  id?: string;
  projectId: string;
  kind: EntityKind;
  name: string;
  alias?: string;
  role?: string;
  description?: string;
  relations?: string;
}

export interface AppPrefs {
  /** 正文提及已建设定卡时是否提示关联，默认关闭 */
  mentionHint: boolean;
  /** 每天首次启动是否自动备份，默认开启 */
  autoBackup: boolean;
  /** 自动备份保留份数，默认 7，范围 1–30 */
  autoBackupKeep: number;
  /** 打字机模式：光标始终停在视口中部 */
  typewriter: boolean;
}

export interface AppInfo {
  dataDir: string;
  version: string;
  dbBytes: number;
}

export type ExportKind = 'txt' | 'markdown' | 'epub';

export const EXPORT_KIND_LABELS: Record<ExportKind, string> = {
  txt: 'TXT（投稿）',
  markdown: 'Markdown',
  epub: 'EPUB（电子书）',
};

export interface BackupInfo {
  filePath: string;
  fileName: string;
  createdAt: number;
  bytes: number;
  projectCount: number;
  chapterCount: number;
}
