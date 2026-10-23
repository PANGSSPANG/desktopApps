import { useEffect, useId, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { XIcon } from './icons'
import { cn } from '../services/format'

interface ModalProps {
  open: boolean
  title: string
  description?: string
  onClose: () => void
  children?: ReactNode
  footer?: ReactNode
  width?: string
  tone?: 'default' | 'danger'
}

export function Modal({
  open,
  title,
  description,
  onClose,
  children,
  footer,
  width = 'max-w-lg',
  tone = 'default',
}: ModalProps): ReactNode {
  const panelRef = useRef<HTMLDivElement>(null)
  const titleId = useId()

  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onClose()
      }
    }
    document.addEventListener('keydown', onKey)
    const focusTimer = window.setTimeout(() => {
      panelRef.current?.querySelector<HTMLElement>('button, [href], input, select')?.focus()
    }, 30)
    return () => {
      document.removeEventListener('keydown', onKey)
      window.clearTimeout(focusTimer)
    }
  }, [open, onClose])

  if (!open) return null

  return createPortal(
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/35 p-6 backdrop-blur-[2px] er-fade-in"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={cn(
          'w-full overflow-hidden rounded-2xl border border-line bg-elevated shadow-2xl er-rise-in',
          width,
        )}
      >
        <div className="flex items-start gap-4 border-b border-line/70 px-6 py-5">
          <div className="min-w-0 flex-1">
            <h2
              id={titleId}
              className={cn(
                'font-reading text-xl font-semibold tracking-tight',
                tone === 'danger' ? 'text-danger' : 'text-ink',
              )}
            >
              {title}
            </h2>
            {description ? (
              <p className="mt-1.5 text-[13px] leading-6 text-muted">{description}</p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="关闭"
            className="rounded-full p-2 text-muted transition hover:bg-canvas hover:text-ink"
          >
            <XIcon size={17} />
          </button>
        </div>
        {children ? <div className="max-h-[65vh] overflow-y-auto px-6 py-5">{children}</div> : null}
        {footer ? (
          <div className="flex items-center justify-end gap-2 border-t border-line/70 bg-surface/60 px-6 py-4">
            {footer}
          </div>
        ) : null}
      </div>
    </div>,
    document.body,
  )
}
