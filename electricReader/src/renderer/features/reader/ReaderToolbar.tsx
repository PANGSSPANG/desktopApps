import { useEffect, useRef, useState, type ReactNode } from 'react'
import type { Book, BookStatus } from '@shared/types'
import {
  ArrowLeftIcon,
  BookmarkIcon,
  CheckIcon,
  ChevronDownIcon,
  SettingsIcon,
  TocIcon,
} from '../../components/icons'
import { cn, formatPercent } from '../../services/format'

interface ReaderToolbarProps {
  book: Book
  percent: number
  tocOpen: boolean
  settingsOpen: boolean
  onBack: () => void
  onToc: () => void
  onSettings: () => void
  onStatus: (status: BookStatus) => void
}

const STATUS_LABEL: Record<BookStatus, string> = {
  unread: '未读',
  reading: '在读',
  finished: '已读',
}

const STATUS_OPTIONS: Array<{ status: BookStatus; label: string }> = [
  { status: 'reading', label: '标记为在读' },
  { status: 'finished', label: '标记为已读' },
  { status: 'unread', label: '标记为未读' },
]

export function ReaderToolbar({
  book,
  percent,
  tocOpen,
  settingsOpen,
  onBack,
  onToc,
  onSettings,
  onStatus,
}: ReaderToolbarProps): ReactNode {
  const [statusOpen, setStatusOpen] = useState(false)
  const statusRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!statusOpen) return
    const onPointer = (event: PointerEvent): void => {
      if (!statusRef.current?.contains(event.target as Node)) setStatusOpen(false)
    }
    document.addEventListener('pointerdown', onPointer)
    return () => document.removeEventListener('pointerdown', onPointer)
  }, [statusOpen])

  return (
    <header className="relative z-30 shrink-0 border-b border-line/60 bg-reader/90 backdrop-blur-xl">
      <div className="mx-auto flex h-[64px] max-w-[1520px] items-center gap-3 px-4 sm:px-6">
        <button
          type="button"
          onClick={onBack}
          aria-label="返回书架"
          className="flex h-9 w-9 items-center justify-center rounded-full text-muted transition hover:bg-surface hover:text-ink"
        >
          <ArrowLeftIcon size={18} />
        </button>

        <div className="min-w-0 flex-1">
          <div className="truncate font-reading text-[15px] font-semibold leading-5 text-ink">
            {book.title}
          </div>
          <div className="truncate text-[10.5px] text-muted">{book.author || '未知作者'}</div>
        </div>

        <div className="flex items-center gap-1.5">
          <div className="relative" ref={statusRef}>
            <button
              type="button"
              data-testid="reader-status"
              onClick={() => setStatusOpen((value) => !value)}
              aria-haspopup="menu"
              aria-expanded={statusOpen}
              className={cn(
                'flex h-8 items-center gap-1.5 rounded-full border px-2.5 text-[11px] transition',
                book.status === 'finished'
                  ? 'border-success/30 bg-success/10 text-success'
                  : book.status === 'reading'
                    ? 'border-accent/30 bg-accent-soft text-accent'
                    : 'border-line text-muted hover:text-ink',
              )}
            >
              {book.status === 'finished' ? <CheckIcon size={13} /> : <BookmarkIcon size={13} />}
              <span className="hidden sm:inline">
                {STATUS_LABEL[book.status]} {formatPercent(percent)}
              </span>
              <ChevronDownIcon size={12} />
            </button>

            {statusOpen ? (
              <div
                role="menu"
                className="absolute right-0 top-full z-50 mt-2 w-44 rounded-xl border border-line bg-elevated p-1.5 shadow-xl er-rise-in"
              >
                {STATUS_OPTIONS.filter((option) => option.status !== book.status).map((option) => (
                  <button
                    key={option.status}
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setStatusOpen(false)
                      onStatus(option.status)
                    }}
                    className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[12px] text-ink transition hover:bg-canvas"
                  >
                    {option.status === 'finished' ? (
                      <CheckIcon size={14} className="text-muted" />
                    ) : (
                      <BookmarkIcon size={14} className="text-muted" />
                    )}
                    {option.label}
                  </button>
                ))}
              </div>
            ) : null}
          </div>

          <button
            type="button"
            data-testid="toc-open"
            onClick={onToc}
            aria-pressed={tocOpen}
            className={cn(
              'flex h-8 items-center gap-1.5 rounded-full border px-2.5 text-[11px] transition',
              tocOpen
                ? 'border-accent/40 bg-accent-soft text-accent'
                : 'border-line text-muted hover:text-ink',
            )}
          >
            <TocIcon size={14} />
            <span className="hidden md:inline">目录</span>
          </button>

          <button
            type="button"
            data-testid="settings-open"
            onClick={onSettings}
            aria-pressed={settingsOpen}
            className={cn(
              'flex h-8 items-center gap-1.5 rounded-full border px-2.5 text-[11px] transition',
              settingsOpen
                ? 'border-accent/40 bg-accent-soft text-accent'
                : 'border-line text-muted hover:text-ink',
            )}
          >
            <SettingsIcon size={14} />
            <span className="hidden md:inline">排版</span>
          </button>
        </div>
      </div>

      <div className="absolute inset-x-0 bottom-0 h-[2px] bg-line/40">
        <div
          className="h-full bg-accent transition-[width] duration-300"
          style={{ width: `${Math.min(100, Math.max(0, percent))}%` }}
        />
      </div>
    </header>
  )
}
