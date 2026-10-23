import type { Book, BookStatus, ThemeName } from '@shared/types'
import type { CSSProperties } from 'react'

export function cn(...values: Array<string | false | null | undefined>): string {
  return values.filter(Boolean).join(' ')
}

export function formatPercent(percent: number): string {
  if (!Number.isFinite(percent) || percent <= 0) return '0%'
  if (percent >= 99.5) return '100%'
  return `${Math.max(1, Math.round(percent))}%`
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`
}

export function formatRelativeDate(iso: string | undefined): string {
  if (!iso) return '尚未阅读'
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return '尚未阅读'
  const now = new Date()
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  const time = date.getTime()
  const diff = startOfToday - time
  if (time >= startOfToday) {
    return `今天 ${date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}`
  }
  if (diff < 2 * 86_400_000) {
    return `昨天 ${date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}`
  }
  if (diff < 7 * 86_400_000) return `${Math.floor(diff / 86_400_000)} 天前`
  if (date.getFullYear() === now.getFullYear()) {
    return date.toLocaleDateString('zh-CN', { month: 'long', day: 'numeric' })
  }
  return date.toLocaleDateString('zh-CN', { year: 'numeric', month: 'short', day: 'numeric' })
}

export function formatReadingTime(iso: string | undefined): string {
  if (!iso) return '还没开始读'
  return `上次阅读 ${formatRelativeDate(iso)}`
}

export function coverUrl(book: Pick<Book, 'id' | 'addedAt'>): string {
  return `reader://cover/${book.id}?v=${encodeURIComponent(book.addedAt)}`
}

export function placeholderStyle(id: string): CSSProperties {
  let hash = 0
  for (let index = 0; index < id.length; index += 1) {
    hash = (hash * 31 + id.charCodeAt(index)) % 360
  }
  const hue = (hash + 24) % 360
  return {
    background: `linear-gradient(145deg, hsl(${hue} 26% 74%), hsl(${(hue + 28) % 360} 32% 48%))`,
  }
}

export const STATUS_TONE: Record<BookStatus, string> = {
  unread: 'border-line/80 bg-elevated/70 text-muted',
  reading: 'border-accent/30 bg-accent-soft text-accent',
  finished: 'border-success/30 bg-success/10 text-success',
}

export const THEME_SWATCHES: Array<{ theme: ThemeName; label: string; colors: [string, string] }> =
  [
    { theme: 'light', label: '浅色', colors: ['#fbf8f1', '#2a2621'] },
    { theme: 'sepia', label: '羊皮纸', colors: ['#f1e7d0', '#3d3022'] },
    { theme: 'dark', label: '深色', colors: ['#1b1916', '#e9e1d3'] },
  ]

export function authorLine(book: Pick<Book, 'author'>): string {
  return book.author?.trim() || '未知作者'
}
