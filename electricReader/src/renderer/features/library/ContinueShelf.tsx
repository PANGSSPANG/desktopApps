import type { ReactNode } from 'react'
import { BOOK_FORMAT_LABELS, type Book } from '@shared/types'
import { BookCover } from '../../components/BookCover'
import { ChevronRightIcon } from '../../components/icons'
import { formatPercent, formatReadingTime } from '../../services/format'

interface ContinueShelfProps {
  book: Book
  onOpen: (book: Book) => void
}

export function ContinueShelf({ book, onOpen }: ContinueShelfProps): ReactNode {
  return (
    <section className="relative overflow-hidden rounded-2xl border border-line/80 bg-surface shadow-[0_20px_50px_-38px_rgba(60,42,24,0.6)]">
      <div className="pointer-events-none absolute -right-16 -top-24 h-64 w-64 rounded-full bg-accent-soft blur-2xl" />
      <div className="pointer-events-none absolute inset-y-0 right-0 hidden w-1/2 items-center justify-end pr-16 lg:flex">
        <div className="max-w-[300px] text-right">
          <div className="font-reading text-[22px] leading-9 text-muted/70">
            「上次合上书的地方，
            <br />
            还在等你。」
          </div>
          <div className="mt-2 text-[11px] uppercase tracking-[0.22em] text-faint">
            Keep reading
          </div>
        </div>
      </div>

      <div className="relative flex items-center gap-5 px-5 py-5 sm:px-7">
        <button
          type="button"
          onClick={() => onOpen(book)}
          className="h-[112px] w-[76px] shrink-0 overflow-hidden rounded-md border border-black/10 shadow-lg transition hover:-translate-y-0.5"
          aria-label={`继续阅读《${book.title}》`}
        >
          <BookCover book={book} />
        </button>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-accent">
            <span className="h-1 w-1 rounded-full bg-accent" />
            继续阅读
          </div>
          <button
            type="button"
            onClick={() => onOpen(book)}
            className="mt-1 block max-w-full truncate text-left font-reading text-[22px] font-semibold leading-8 text-ink transition hover:text-accent sm:text-[25px]"
          >
            {book.title}
          </button>
          <div className="mt-1 truncate text-[12px] text-muted">
            {book.author || '未知作者'} · {BOOK_FORMAT_LABELS[book.format]} ·{' '}
            {formatReadingTime(book.lastReadAt)}
          </div>

          <div className="mt-3 flex items-center gap-3">
            <div className="h-1 w-40 max-w-[45%] overflow-hidden rounded-full bg-line">
              <div
                className="h-full rounded-full bg-accent"
                style={{ width: `${Math.min(100, Math.max(0, book.progress.percent))}%` }}
              />
            </div>
            <span className="text-[11px] tabular-nums text-muted">
              已读 {formatPercent(book.progress.percent)}
            </span>
          </div>
        </div>

        <button
          type="button"
          onClick={() => onOpen(book)}
          className="hidden shrink-0 items-center gap-1.5 rounded-full bg-ink px-5 py-2.5 text-[12.5px] font-medium text-canvas transition hover:opacity-90 sm:flex"
        >
          继续
          <ChevronRightIcon size={15} />
        </button>
      </div>
    </section>
  )
}
