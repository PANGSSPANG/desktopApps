import { useState, type ReactNode } from 'react'
import { BOOK_FORMAT_LABELS, type Book } from '@shared/types'
import { cn, coverUrl, placeholderStyle } from '../services/format'

interface BookCoverProps {
  book: Book
  className?: string
  compact?: boolean
}

export function BookCover({ book, className, compact = false }: BookCoverProps): ReactNode {
  const [failedUrl, setFailedUrl] = useState<string | null>(null)
  const url = coverUrl(book)

  if (book.format === 'txt' || failedUrl === url || book.fileMissing) {
    return (
      <div
        className={cn(
          'relative flex h-full w-full flex-col justify-between overflow-hidden p-3 text-white',
          className,
        )}
        style={placeholderStyle(book.id)}
        aria-label={`${book.title} 暂无封面`}
      >
        <div className="absolute inset-y-0 left-0 w-1.5 bg-black/15" />
        <div className="text-[10px] font-medium uppercase tracking-[0.16em] text-white/70">
          {BOOK_FORMAT_LABELS[book.format]}
        </div>
        <div
          className={cn(
            'font-reading font-semibold leading-tight drop-shadow-sm',
            compact ? 'text-[11px]' : 'text-sm',
          )}
        >
          <span className="er-line-clamp-2">{book.title}</span>
        </div>
        <div className="h-5" />
      </div>
    )
  }

  return (
    <img
      src={url}
      alt={`《${book.title}》封面`}
      loading="lazy"
      decoding="async"
      draggable={false}
      onError={() => setFailedUrl(url)}
      className={cn('h-full w-full object-cover', className)}
    />
  )
}
