import { useEffect, useRef, useState, type ReactNode } from 'react'
import type { Book, BookStatus } from '@shared/types'
import { cn } from '../../services/format'
import { useLibraryStore } from '../../stores/library-store'
import {
  BookmarkIcon,
  CheckIcon,
  LocateIcon,
  MoreIcon,
  TrashIcon,
  XIcon,
} from '../../components/icons'

interface BookMenuProps {
  book: Book
  onDelete: (book: Book) => void
  align?: 'left' | 'right'
  plain?: boolean
}

const STATUS_OPTIONS: Array<{ status: BookStatus; label: string }> = [
  { status: 'unread', label: '标记为未读' },
  { status: 'reading', label: '标记为在读' },
  { status: 'finished', label: '标记为已读' },
]

export function BookMenu({
  book,
  onDelete,
  align = 'right',
  plain = false,
}: BookMenuProps): ReactNode {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const setStatus = useLibraryStore((state) => state.setStatus)
  const relocate = useLibraryStore((state) => state.relocate)

  useEffect(() => {
    if (!open) return
    const onPointer = (event: PointerEvent): void => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
    }
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', onPointer)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onPointer)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const run = (task: () => Promise<unknown>): void => {
    setOpen(false)
    void task()
  }

  return (
    <div
      className="relative"
      ref={rootRef}
      onClick={(event) => event.stopPropagation()}
      onKeyDown={(event) => event.stopPropagation()}
    >
      <button
        type="button"
        aria-label={`《${book.title}》更多操作`}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className={cn(
          'flex h-8 w-8 items-center justify-center rounded-full border backdrop-blur transition',
          plain
            ? 'border-line bg-surface text-muted hover:border-accent/40 hover:text-ink'
            : 'border-white/20 bg-black/35 text-white hover:bg-black/55',
        )}
      >
        {open ? <XIcon size={15} /> : <MoreIcon size={16} />}
      </button>

      {open ? (
        <div
          role="menu"
          className={cn(
            'absolute top-full z-50 mt-2 w-48 overflow-hidden rounded-xl border border-line bg-elevated p-1.5 shadow-xl er-rise-in',
            align === 'right' ? 'right-0' : 'left-0',
          )}
        >
          {book.fileMissing ? (
            <button
              type="button"
              role="menuitem"
              onClick={() => run(() => relocate(book.id))}
              className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[12px] text-accent transition hover:bg-accent-soft"
            >
              <LocateIcon size={15} />
              重新定位文件
            </button>
          ) : null}

          {STATUS_OPTIONS.filter((option) => option.status !== book.status).map((option) => (
            <button
              key={option.status}
              type="button"
              role="menuitem"
              onClick={() => run(() => setStatus(book.id, option.status))}
              className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[12px] text-ink transition hover:bg-canvas"
            >
              {option.status === 'finished' ? (
                <CheckIcon size={15} className="text-muted" />
              ) : (
                <BookmarkIcon size={15} className="text-muted" />
              )}
              {option.label}
            </button>
          ))}

          <div className="my-1 h-px bg-line/70" />
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false)
              onDelete(book)
            }}
            className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[12px] text-danger transition hover:bg-danger-soft"
          >
            <TrashIcon size={15} />
            从书库移除
          </button>
        </div>
      ) : null}
    </div>
  )
}
