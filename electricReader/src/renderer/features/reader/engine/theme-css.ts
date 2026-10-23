import type { Locator, ReaderSettings, ThemeName } from '@shared/types'

export interface ReaderThemeColors {
  background: string
  page: string
  ink: string
  muted: string
  line: string
  accent: string
  accentSoft: string
  selection: string
}

export const READER_THEME_COLORS: Record<ThemeName, ReaderThemeColors> = {
  light: {
    background: '#ece5d9',
    page: '#fbf8f1',
    ink: '#2a2621',
    muted: '#776e62',
    line: '#ded5c6',
    accent: '#a24d35',
    accentSoft: 'rgba(162, 77, 53, 0.12)',
    selection: 'rgba(162, 77, 53, 0.22)',
  },
  sepia: {
    background: '#dfd2b6',
    page: '#f1e7d0',
    ink: '#3d3022',
    muted: '#7d6a52',
    line: '#d3c2a1',
    accent: '#8b4a2c',
    accentSoft: 'rgba(139, 74, 44, 0.12)',
    selection: 'rgba(139, 74, 44, 0.22)',
  },
  dark: {
    background: '#11100f',
    page: '#1b1916',
    ink: '#e9e1d3',
    muted: '#a49a89',
    line: '#39342c',
    accent: '#dc9474',
    accentSoft: 'rgba(220, 148, 116, 0.14)',
    selection: 'rgba(220, 148, 116, 0.26)',
  },
}

const FONT_STACKS = {
  serif:
    '"Source Han Serif SC", "Noto Serif SC", "Songti SC", SimSun, "STSong", "Times New Roman", serif',
  sans: '"Source Han Sans SC", "Noto Sans SC", "Microsoft YaHei", "PingFang SC", "Segoe UI", sans-serif',
} as const

export function readerFontStack(fontFamily: ReaderSettings['fontFamily']): string {
  return FONT_STACKS[fontFamily]
}

/**
 * 注入 iframe 的阅读样式。所有值都来自受枚举约束的设置，不能拼接用户输入。
 * 用 !important 压过出版社样式，保证字号/行距/主题在任何书上都能生效。
 */
export function buildEpubCss(settings: ReaderSettings, theme: ThemeName): string {
  const colors = READER_THEME_COLORS[theme]
  const indent = settings.indentFirstLine ? '2em' : '0'
  return `
    :root { color-scheme: ${theme === 'dark' ? 'dark' : 'light'}; }
    html, body {
      background: ${colors.page} !important;
      color: ${colors.ink} !important;
      margin: 0 !important;
      padding: 0 !important;
      box-sizing: border-box !important;
      overflow-wrap: break-word !important;
      -webkit-font-smoothing: antialiased;
    }
    body {
      font-family: ${FONT_STACKS[settings.fontFamily]} !important;
      font-size: ${settings.fontSize}% !important;
      line-height: ${settings.lineHeight} !important;
      padding: 30px 6px 18px !important;
      text-rendering: optimizeLegibility;
      text-spacing-trim: space-first;
      line-break: strict;
    }
    p, div, li, dd, dt, blockquote {
      line-height: ${settings.lineHeight} !important;
      color: ${colors.ink} !important;
    }
    p {
      margin: 0 0 0.72em !important;
      text-indent: ${indent} !important;
      orphans: 2;
      widows: 2;
    }
    p:first-child, p:first-of-type { margin-top: 0 !important; }
    h1, h2, h3, h4, h5, h6 {
      color: ${colors.ink} !important;
      font-family: ${FONT_STACKS[settings.fontFamily]} !important;
      line-height: 1.35 !important;
      text-indent: 0 !important;
      font-weight: 700 !important;
      margin: 1.2em 0 0.7em !important;
      break-after: avoid;
    }
    h1 { font-size: 1.65em !important; }
    h2 { font-size: 1.4em !important; }
    h3 { font-size: 1.2em !important; }
    a { color: ${colors.accent} !important; text-decoration-color: ${colors.accentSoft}; }
    blockquote {
      margin: 1em 0 !important;
      padding: 0.2em 0 0.2em 1em !important;
      border-left: 2px solid ${colors.line} !important;
      color: ${colors.muted} !important;
    }
    blockquote p { color: ${colors.muted} !important; }
    hr { border: 0; border-top: 1px solid ${colors.line}; margin: 1.6em 0; }
    img, svg, video {
      max-width: 100% !important;
      height: auto !important;
      object-fit: contain;
    }
    figure { margin: 1.2em 0 !important; text-align: center; }
    figcaption { color: ${colors.muted} !important; font-size: 0.85em; text-indent: 0; }
    table { max-width: 100% !important; border-collapse: collapse; }
    td, th { border-color: ${colors.line} !important; }
    code, pre { font-family: "Cascadia Mono", Consolas, monospace !important; }
    pre { white-space: pre-wrap !important; }
    ::selection { background: ${colors.selection} !important; }
    * { max-height: none; }
  `
}

export function locatorTitle(locator: Locator): string {
  return locator.title ?? '正文'
}
