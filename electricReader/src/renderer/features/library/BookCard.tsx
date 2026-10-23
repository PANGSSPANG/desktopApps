import type { ReactNode } from 'react'
import { BOOK_FORMAT_LABELS, type Book } from '@shared/types'
import { BookCover } from '../../components/BookCover'
import { cn, formatPercent, formatReadingTime, STATUS_TONE } from '../../services/format'
import { BookMenu } from './BookMenu'

interface BookCardProps {
  book: Book
  onOpen: (book: Book) => void
  onDelete: (book: Book) => void
  onRelocate: (book: Book) => void
}

export function BookCard({ book, onOpen, onDelete, onRelocate }: BookCardProps): ReactNode {
  return (
    <article className="group min-w-0">
      <div className="relative">
        <div className="relative aspect-[2/3] overflow-hidden rounded-lg border border-black/10 bg-elevated shadow-[0_14px_30px_-18px_rgba(50,35,20,0.55)] transition duration-200 group-hover:-translate-y-1 group-hover:shadow-[0_22px_40px_-20px_rgba(50,35,20,0.6)]">
          {book.fileMissing ? (
            <div className="h-full w-full">
              <BookCover book={book} />
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/55 p-3 text-center text-white backdrop-blur-[1px]">
                <span className="text-[11px] font-medium">文件缺失</span>
                <button
                  type="button"
                  onClick={() => onRelocate(book)}
                  className="rounded-full bg-white/90 px-3 py-1 text-[11px] font-semibold text-black transition hover:bg-white"
                >
                  重新定位
                </button>
                <button
                  type="button"
                  onClick={() => onDelete(book)}
                  className="text-[10px] text-white/70 underline-offset-2 hover:underline"
                >
                  移除
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => onOpen(book)}
              className="block h-full w-full text-left"
              aria-label={`阅读《${book.title}》`}
            >
              <BookCover book={book} />
              <span className="absolute inset-0 bg-gradient-to-t from-black/25 via-transparent to-transparent opacity-0 transition group-hover:opacity-100" />
              <span className="absolute inset-x-0 bottom-0 translate-y-2 bg-gradient-to-t from-black/60 to-transparent px-3 pb-2.5 pt-8 text-[11px] font-medium text-white opacity-0 transition duration-200 group-hover:translate-y-0 group-hover:opacity-100">
                {book.progress.percent > 0 ? '继续阅读' : '开始阅读'} →
              </span>
            </button>
          )}

          <span
            className={cn(
              'pointer-events-none absolute left-2 top-2 rounded-full border px-2 py-0.5 text-[10px] font-medium backdrop-blur',
              STATUS_TONE[book.status],
            )}
          >
            {book.status === 'reading'
              ? `在读 ${formatPercent(book.progress.percent)}`
              : book.status === 'finished'
                ? '已读'
                : '未读'}
          </span>

          <div className="absolute right-2 top-2 opacity-90">
            <BookMenu book={book} onDelete={onDelete} />
          </div>
        </div>
      </div>

      <div className="min-w-0 px-0.5 pt-3">
        <button
          type="button"
          onClick={() => (book.fileMissing ? onRelocate(book) : onOpen(book))}
          className="block w-full truncate text-left font-reading text-[15px] font-semibold leading-6 text-ink transition hover:text-accent"
          title={book.title}
        >
          {book.title}
        </button>
        <div className="mt-0.5 truncate text-[11.5px] text-muted">
          {book.author || '未知作者'} · {BOOK_FORMAT_LABELS[book.format]}
        </div>

        <div className="mt-2 flex items-center justify-between gap-2 text-[10.5px] text-faint">
          <span className="truncate">{formatReadingTime(book.lastReadAt)}</span>
          <span className="shrink-0 tabular-nums">{formatPercent(book.progress.percent)}</span>
        </div>
        <div className="mt-1.5 h-[3px] overflow-hidden rounded-full bg-line/70">
          <div
            className="h-full rounded-full bg-accent transition-[width] duration-500"
            style={{ width: `${Math.min(100, Math.max(0, book.progress.percent))}%` }}
          />
        </div>
      </div>
    </article>
  )
}
