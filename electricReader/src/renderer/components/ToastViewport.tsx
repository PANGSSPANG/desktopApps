import type { ReactNode } from 'react'
import { AlertTriangleIcon, CheckCircleIcon, InfoIcon, XIcon } from './icons'
import { useToastStore, type ToastKind } from '../stores/toast-store'
import { cn } from '../services/format'

const ICONS: Record<ToastKind, ReactNode> = {
  success: <CheckCircleIcon size={19} />,
  error: <AlertTriangleIcon size={19} />,
  info: <InfoIcon size={19} />,
}

const TONES: Record<ToastKind, string> = {
  success: 'text-success',
  error: 'text-danger',
  info: 'text-accent',
}

export function ToastViewport(): ReactNode {
  const toasts = useToastStore((state) => state.toasts)
  const dismiss = useToastStore((state) => state.dismiss)

  if (toasts.length === 0) return null

  return (
    <div
      className="pointer-events-none fixed bottom-5 right-5 z-[100] flex w-[min(380px,calc(100vw-40px))] flex-col gap-2"
      aria-live="polite"
    >
      {toasts.map((item) => (
        <div
          key={item.id}
          role="status"
          className="pointer-events-auto flex items-start gap-3 rounded-xl border border-line bg-elevated/95 px-4 py-3 shadow-xl backdrop-blur er-slide-left"
        >
          <span className={cn('mt-0.5 shrink-0', TONES[item.kind])}>{ICONS[item.kind]}</span>
          <div className="min-w-0 flex-1">
            <div className="text-[13px] font-semibold text-ink">{item.title}</div>
            {item.description ? (
              <div className="mt-0.5 text-xs leading-5 text-muted">{item.description}</div>
            ) : null}
          </div>
          <button
            type="button"
            onClick={() => dismiss(item.id)}
            aria-label="关闭提示"
            className="shrink-0 rounded p-1 text-faint transition hover:bg-canvas hover:text-ink"
          >
            <XIcon size={13} />
          </button>
        </div>
      ))}
    </div>
  )
}
