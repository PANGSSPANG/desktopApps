import type {
  BookFormat,
  FontFamily,
  FontSize,
  LineHeight,
  Locator,
  MaxWidth,
  PageTurn,
  ReaderSettings,
  ThemeName,
} from './types'

export const FONT_SIZE_OPTIONS: readonly FontSize[] = [100, 115, 130, 145, 160]
export const LINE_HEIGHT_OPTIONS: readonly LineHeight[] = [1.5, 1.7, 1.9]
export const MAX_WIDTH_OPTIONS: readonly MaxWidth[] = [640, 720, 820, 960]
export const THEME_OPTIONS: readonly ThemeName[] = ['light', 'sepia', 'dark']
export const FONT_FAMILY_OPTIONS: readonly FontFamily[] = ['serif', 'sans']
export const PAGE_TURN_OPTIONS: readonly PageTurn[] = ['keys', 'click', 'both']

export const DEFAULT_SETTINGS: ReaderSettings = {
  fontSize: 130,
  lineHeight: 1.7,
  maxWidth: 720,
  theme: 'light',
  followSystem: true,
  fontFamily: 'serif',
  indentFirstLine: true,
  pageTurn: 'both',
}

export const EMPTY_LOCATOR: Locator = {
  href: '',
  type: 'application/xhtml+xml',
  locations: { progression: 0, totalProgression: 0 },
}

function includes<T extends string | number>(options: readonly T[], value: unknown): value is T {
  return options.some((option) => option === value)
}

export function isThemeName(value: unknown): value is ThemeName {
  return includes(THEME_OPTIONS, value)
}

export function isBookStatus(value: unknown): value is 'unread' | 'reading' | 'finished' {
  return value === 'unread' || value === 'reading' || value === 'finished'
}

export function isBookFormat(value: unknown): value is BookFormat {
  return value === 'epub' || value === 'txt'
}

/** 外部输入（磁盘文件 / IPC / 拖拽）统一走白名单合并，非法值回落到默认设置。 */
export function normalizeSettings(value: unknown): ReaderSettings {
  const input =
    typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {}
  return {
    fontSize: includes(FONT_SIZE_OPTIONS, input.fontSize)
      ? input.fontSize
      : DEFAULT_SETTINGS.fontSize,
    lineHeight: includes(LINE_HEIGHT_OPTIONS, input.lineHeight)
      ? input.lineHeight
      : DEFAULT_SETTINGS.lineHeight,
    maxWidth: includes(MAX_WIDTH_OPTIONS, input.maxWidth)
      ? input.maxWidth
      : DEFAULT_SETTINGS.maxWidth,
    theme: isThemeName(input.theme) ? input.theme : DEFAULT_SETTINGS.theme,
    followSystem:
      typeof input.followSystem === 'boolean' ? input.followSystem : DEFAULT_SETTINGS.followSystem,
    fontFamily: includes(FONT_FAMILY_OPTIONS, input.fontFamily)
      ? input.fontFamily
      : DEFAULT_SETTINGS.fontFamily,
    indentFirstLine:
      typeof input.indentFirstLine === 'boolean'
        ? input.indentFirstLine
        : DEFAULT_SETTINGS.indentFirstLine,
    pageTurn: includes(PAGE_TURN_OPTIONS, input.pageTurn)
      ? input.pageTurn
      : DEFAULT_SETTINGS.pageTurn,
  }
}

export function mergeSettings(
  current: ReaderSettings,
  patch: Partial<ReaderSettings>,
): ReaderSettings {
  return normalizeSettings({ ...current, ...patch })
}

export function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.min(1, Math.max(0, value))
}

export function clampPercent(value: number): number {
  return clamp01(value / 100) * 100
}

export function normalizeLocator(value: unknown): Locator | null {
  if (typeof value !== 'object' || value === null) return null
  const input = value as Record<string, unknown>
  if (typeof input.href !== 'string' || input.href.length === 0) return null

  const locations =
    typeof input.locations === 'object' && input.locations !== null
      ? (input.locations as Record<string, unknown>)
      : {}
  const progression = clamp01(typeof locations.progression === 'number' ? locations.progression : 0)
  const totalProgression =
    typeof locations.totalProgression === 'number' ? clamp01(locations.totalProgression) : undefined

  const textInput =
    typeof input.text === 'object' && input.text !== null
      ? (input.text as Record<string, unknown>)
      : undefined
  const text = textInput
    ? {
        ...(typeof textInput.before === 'string' ? { before: textInput.before.slice(0, 500) } : {}),
        ...(typeof textInput.highlight === 'string'
          ? { highlight: textInput.highlight.slice(0, 500) }
          : {}),
        ...(typeof textInput.after === 'string' ? { after: textInput.after.slice(0, 500) } : {}),
      }
    : undefined

  return {
    href: input.href,
    type: typeof input.type === 'string' && input.type ? input.type : 'application/xhtml+xml',
    ...(typeof input.title === 'string' && input.title ? { title: input.title } : {}),
    ...(typeof input.cfi === 'string' && input.cfi ? { cfi: input.cfi } : {}),
    locations: {
      progression,
      ...(totalProgression === undefined ? {} : { totalProgression }),
    },
    ...(text && Object.keys(text).length > 0 ? { text } : {}),
  }
}

export function serializeLocator(locator: Locator): string {
  return JSON.stringify(locator)
}

export function deserializeLocator(value: string | null | undefined): Locator | null {
  if (!value) return null
  try {
    return normalizeLocator(JSON.parse(value))
  } catch {
    return null
  }
}

export function sameLocator(a: Locator, b: Locator, tolerance = 0.002): boolean {
  if (a.href !== b.href) return false
  return Math.abs(a.locations.progression - b.locations.progression) <= tolerance
}

export function formatPercent(percent: number): string {
  if (!Number.isFinite(percent) || percent <= 0) return '0%'
  if (percent >= 99.5) return '100%'
  return `${Math.max(1, Math.round(percent))}%`
}
