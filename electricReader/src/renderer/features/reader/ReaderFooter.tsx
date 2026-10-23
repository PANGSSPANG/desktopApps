import type { ReactNode } from 'react'
import { ChevronLeftIcon, ChevronRightIcon } from '../../components/icons'
import { formatPercent } from '../../services/format'

interface ReaderFooterProps {
  chapter: string
  percent: number
  onPrev: () => void
  onNext: () => void
}

export function ReaderFooter({ chapter, percent, onPrev, onNext }: ReaderFooterProps): ReactNode {
  return (
    <footer className="relative z-20 flex h-[46px] shrink-0 items-center gap-3 border-t border-line/60 bg-reader/90 px-4 backdrop-blur sm:px-6">
      <div className="min-w-0 flex-1 truncate text-[10.5px] text-muted">{chapter}</div>
      <div className="hidden items-center gap-3 text-[10px] text-faint sm:flex">
        <span className="hidden lg:inline">← → / 空格翻页</span>
        <span className="h-1 w-1 rounded-full bg-line" />
        <span data-testid="reader-percent" className="tabular-nums">
          {formatPercent(percent)}
        </span>
      </div>
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={onPrev}
          aria-label="上一页"
          className="flex h-7 w-7 items-center justify-center rounded-full text-muted transition hover:bg-surface hover:text-ink"
        >
          <ChevronLeftIcon size={16} />
        </button>
        <button
          type="button"
          onClick={onNext}
          aria-label="下一页"
          className="flex h-7 w-7 items-center justify-center rounded-full text-muted transition hover:bg-surface hover:text-ink"
        >
          <ChevronRightIcon size={16} />
        </button>
      </div>
    </footer>
  )
}
