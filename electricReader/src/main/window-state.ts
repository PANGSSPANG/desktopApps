import { screen, type BrowserWindow, type Rectangle } from 'electron'
import type { WindowState } from '@shared/types'
import type { LibraryRepository } from './storage/library-repo'

export const DEFAULT_WINDOW_STATE: WindowState = {
  width: 1220,
  height: 820,
  maximized: false,
}

const MIN_WIDTH = 900
const MIN_HEIGHT = 620

function intersects(a: Rectangle, b: Rectangle): number {
  const width = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x)
  const height = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y)
  return width > 60 && height > 40 ? width * height : 0
}

/** 还原窗口时校验显示器范围，拔掉外接屏后不会把窗口丢在屏幕外。 */
export function resolveWindowBounds(state: WindowState | undefined): Rectangle {
  const source = state ?? DEFAULT_WINDOW_STATE
  const primary = screen.getPrimaryDisplay()
  const width = Math.min(
    Math.max(source.width, MIN_WIDTH),
    Math.max(primary.workArea.width, MIN_WIDTH),
  )
  const height = Math.min(
    Math.max(source.height, MIN_HEIGHT),
    Math.max(primary.workArea.height, MIN_HEIGHT),
  )

  if (source.x === undefined || source.y === undefined) {
    return {
      x: Math.round(primary.workArea.x + (primary.workArea.width - width) / 2),
      y: Math.round(primary.workArea.y + (primary.workArea.height - height) / 2),
      width,
      height,
    }
  }

  const candidate: Rectangle = { x: source.x, y: source.y, width, height }
  const display = screen.getDisplayMatching(candidate)
  if (intersects(candidate, display.workArea) > 0) return candidate

  return {
    x: Math.round(display.workArea.x + (display.workArea.width - width) / 2),
    y: Math.round(display.workArea.y + (display.workArea.height - height) / 2),
    width,
    height,
  }
}

export function currentWindowState(win: BrowserWindow): WindowState {
  const bounds = win.isMaximized() ? win.getNormalBounds() : win.getBounds()
  return {
    x: bounds.x,
    y: bounds.y,
    width: bounds.width,
    height: bounds.height,
    maximized: win.isMaximized(),
  }
}

/** 移动/缩放停止 250ms 后落盘，关闭时强制写最后一次。 */
export function trackWindowState(win: BrowserWindow, repo: LibraryRepository): () => void {
  let timer: NodeJS.Timeout | undefined
  let disposed = false

  const flush = (): void => {
    if (disposed || win.isDestroyed()) return
    if (timer) {
      clearTimeout(timer)
      timer = undefined
    }
    void repo.saveWindowState(currentWindowState(win)).catch((error: unknown) => {
      console.error('保存窗口状态失败', error)
    })
  }

  const schedule = (): void => {
    if (disposed || win.isDestroyed()) return
    if (timer) clearTimeout(timer)
    timer = setTimeout(flush, 250)
  }

  win.on('resize', schedule)
  win.on('move', schedule)
  win.on('maximize', schedule)
  win.on('unmaximize', schedule)
  win.on('close', flush)

  return () => {
    disposed = true
    if (timer) clearTimeout(timer)
    win.off('resize', schedule)
    win.off('move', schedule)
    win.off('maximize', schedule)
    win.off('unmaximize', schedule)
    win.off('close', flush)
  }
}
