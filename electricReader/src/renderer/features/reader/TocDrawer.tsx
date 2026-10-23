import { useEffect, useRef, type ReactNode } from 'react'
import type { TocItem } from '@shared/types'
import { BookOpenIcon, XIcon } from '../../components/icons'
import { cn } from '../../services/format'

interface TocDrawerProps {
  open: boolean
  toc: TocItem[]
  activeHref: string
  onClose: () => void
  onNavigate: (href: string) => void
}

function chapterKey(href: string): string {
  const path = href.split('#')[0] ?? href
  try {
    return decodeURIComponent(path)
  } catch {
    return path
  }
}

function hasMatchingHref(items: TocItem[], activeKey: string): boolean {
  return items.some(
    (item) =>
      (item.href.length > 0 && chapterKey(item.href) === activeKey) ||
      hasMatchingHref(item.children, activeKey),
  )
}

function TocBranch({
  items,
  depth,
  activeHref,
  onNavigate,
}: {
  items: TocItem[]
  depth: number
  activeHref: string
  onNavigate: (href: string) => void
}): ReactNode {
  const activeKey = chapterKey(activeHref)

  return (
    <ul className={cn(depth === 0 ? 'space-y-0.5' : 'mt-0.5 space-y-0.5')}>
      {items.map((item) => {
        const matches = item.href.length > 0 && chapterKey(item.href) === activeKey
        // 卷标题和首章可能共用同一个 href，只高亮最深一层，避免同一位置亮两项。
        const active = matches && !hasMatchingHref(item.children, activeKey)
        return (
          <li key={item.id}>
            <button
              type="button"
              data-active={active || undefined}
              onClick={() => item.href && onNavigate(item.href)}
              className={cn(
                'relative flex w-full items-start rounded-lg py-2 pr-2 text-left text-[12.5px] leading-5 transition',
                depth === 0 ? 'pl-3' : '',
                active
                  ? 'bg-accent-soft font-medium text-accent'
                  : 'text-muted hover:bg-surface hover:text-ink',
                !item.href && 'cursor-default opacity-60',
              )}
              style={depth > 0 ? { paddingLeft: `${12 + depth * 14}px` } : undefined}
            >
              {active ? (
                <span className="absolute bottom-2 left-0 top-2 w-[2px] rounded-full bg-accent" />
              ) : null}
              <span className="er-line-clamp-2">{item.label}</span>
            </button>
            {item.children.length > 0 ? (
              <TocBranch
                items={item.children}
                depth={depth + 1}
                activeHref={activeHref}
                onNavigate={onNavigate}
              />
            ) : null}
          </li>
        )
      })}
    </ul>
  )
}

export function TocDrawer({
  open,
  toc,
  activeHref,
  onClose,
  onNavigate,
}: TocDrawerProps): ReactNode {
  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const timer = window.setTimeout(() => {
      panelRef.current
        ?.querySelector<HTMLElement>('[data-active="true"]')
        ?.scrollIntoView({ block: 'center' })
    }, 80)
    return () => window.clearTimeout(timer)
  }, [open, activeHref])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="absolute inset-0 bg-black/20 er-fade-in" onClick={onClose} />
      <aside
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="目录"
        className="relative flex h-full w-[360px] max-w-[86vw] flex-col border-r border-line bg-elevated shadow-2xl er-slide-right"
      >
        <div className="flex h-[64px] shrink-0 items-center justify-between border-b border-line/70 px-5">
          <div>
            <div className="font-reading text-[17px] font-semibold text-ink">目录</div>
            <div className="text-[10px] uppercase tracking-[0.16em] text-faint">
              {toc.length > 0 ? `${toc.length} 个一级章节` : 'Contents'}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="关闭目录"
            className="rounded-full p-2 text-muted transition hover:bg-canvas hover:text-ink"
          >
            <XIcon size={17} />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-2 py-3">
          {toc.length === 0 ? (
            <div className="flex flex-col items-center px-6 py-14 text-center text-muted">
              <BookOpenIcon size={24} className="text-faint" />
              <p className="mt-3 text-[12px] leading-6">
                这本书没有可用的目录信息
                <br />
                仍可以用翻页继续阅读。
              </p>
            </div>
          ) : (
            <TocBranch items={toc} depth={0} activeHref={activeHref} onNavigate={onNavigate} />
          )}
        </div>
      </aside>
    </div>
  )
}
