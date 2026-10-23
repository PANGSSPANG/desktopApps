import type { ReactNode } from 'react'
import { cn } from '../services/format'

export function Spinner({ className }: { className?: string }): ReactNode {
  return (
    <span
      className={cn(
        'inline-block h-5 w-5 animate-spin rounded-full border-2 border-current border-t-transparent',
        className,
      )}
      aria-hidden="true"
    />
  )
}

export function PageLoading({ label = '加载中…' }: { label?: string }): ReactNode {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-canvas text-muted">
      <Spinner className="h-7 w-7 text-accent" />
      <span className="text-sm tracking-wide">{label}</span>
    </div>
  )
}
