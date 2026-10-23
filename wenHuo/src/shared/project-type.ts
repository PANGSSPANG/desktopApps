/**
 * 项目类型模板：只影响默认值、侧栏模块与默认导出模板，
 * 不产生三套代码，也不改变数据模型（PRD §4.2）。
 */
export const GENRES = ['webnovel', 'novel', 'nonfiction'] as const;

export type Genre = (typeof GENRES)[number];

export type SidebarModule =
  'manuscript' | 'outline' | 'characters' | 'locations' | 'timeline' | 'stats';

export type ExportFormat = 'txt' | 'markdown' | 'epub' | 'docx' | 'pdf';

export interface ProjectTypeProfile {
  genre: Genre;
  label: string;
  defaultDailyGoal: number;
  defaultTargetWords: number;
  sidebarModules: readonly SidebarModule[];
  defaultExport: ExportFormat;
}

export const PROJECT_TYPES: Record<Genre, ProjectTypeProfile> = {
  webnovel: {
    genre: 'webnovel',
    label: '网文连载',
    defaultDailyGoal: 4000,
    defaultTargetWords: 1000000,
    sidebarModules: ['manuscript', 'characters', 'stats'],
    defaultExport: 'txt',
  },
  novel: {
    genre: 'novel',
    label: '小说',
    defaultDailyGoal: 1500,
    defaultTargetWords: 300000,
    sidebarModules: ['manuscript', 'outline', 'characters', 'locations', 'stats'],
    defaultExport: 'epub',
  },
  nonfiction: {
    genre: 'nonfiction',
    label: '非虚构',
    defaultDailyGoal: 1000,
    defaultTargetWords: 200000,
    sidebarModules: ['manuscript', 'stats'],
    defaultExport: 'markdown',
  },
};

export function isGenre(value: unknown): value is Genre {
  return typeof value === 'string' && (GENRES as readonly string[]).includes(value);
}

export function profileOf(genre: Genre): ProjectTypeProfile {
  return PROJECT_TYPES[genre];
}
