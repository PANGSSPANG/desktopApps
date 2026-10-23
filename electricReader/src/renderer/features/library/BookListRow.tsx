import type { ReactNode } from 'react'
import { BOOK_FORMAT_LABELS, type Book } from '@shared/types'
import { BookCover } from '../../components/BookCover'
import {
  cn,
  formatPercent,
  formatReadingTime,
  formatFileSize,
  STATUS_TONE,
} from '../../services/format'
import { BookMenu } from './BookMenu'

interface BookListRowProps {
  book: Book
  onOpen: (book: Book) => void
  onDelete: (book: Book) => void
  onRelocate: (book: Book) => void
}

export function BookListRow({ book, onOpen, onDelete, onRelocate }: BookListRowProps): ReactNode {
  const open = (): void => {
    if (book.fileMissing) onRelocate(book)
    else onOpen(book)
  }

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={open}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          open()
        }
      }}
      className="group flex items-center gap-4 rounded-xl border border-transparent px-3 py-3 text-left transition hover:border-line hover:bg-surface/70"
    >
      <div className="h-[74px] w-[50px] shrink-0 overflow-hidden rounded-md border border-black/10 bg-elevated">
        <BookCover book={book} compact />
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="truncate font-reading text-[15px] font-semibold text-ink">
            {book.title}
          </span>
          <span
            className={cn(
              'rounded-full border px-2 py-0.5 text-[10px] font-medium',
              STATUS_TONE[book.status],
            )}
          >
            {book.status === 'unread' ? '未读' : book.status === 'finished' ? '已读' : '在读'}
          </span>
          {book.fileMissing ? (
            <span className="rounded-full border border-danger/30 bg-danger-soft px-2 py-0.5 text-[10px] font-medium text-danger">
              文件缺失
            </span>
          ) : null}
        </div>
        <div className="mt-0.5 truncate text-[12px] text-muted">
          {book.author || '未知作者'} · {BOOK_FORMAT_LABELS[book.format]} ·{' '}
          {formatFileSize(book.fileSize)}
        </div>
        <div className="mt-1.5 flex items-center gap-3 text-[10.5px] text-faint">
          <span>{formatReadingTime(book.lastReadAt)}</span>
          <span className="tabular-nums">{formatPercent(book.progress.percent)}</span>
        </div>
      </div>

      <div className="hidden w-36 shrink-0 md:block">
        <div className="h-1 overflow-hidden rounded-full bg-line/70">
          <div
            className="h-full rounded-full bg-accent"
            style={{ width: `${Math.min(100, Math.max(0, book.progress.percent))}%` }}
          />
        </div>
      </div>

      <div onClick={(event) => event.stopPropagation()}>
        <BookMenu book={book} onDelete={onDelete} plain />
      </div>
    </div>
  )
}
