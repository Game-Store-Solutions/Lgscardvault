import { useEffect, useId, useRef } from 'react'
import type { ReactNode } from 'react'
import { X } from 'lucide-react'
import { cx } from '../../lib/cx'

export interface ModalProps {
  open: boolean
  onClose: () => void
  title?: ReactNode
  children: ReactNode
  footer?: ReactNode
  className?: string
}

export function Modal({ open, onClose, title, children, footer, className }: ModalProps) {
  const panelRef = useRef<HTMLDivElement>(null)
  const titleId = useId()

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    // Focus the panel when it opens.
    panelRef.current?.focus()
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prevOverflow
    }
  }, [open, onClose])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50">
      {/* Backdrop — a true dim that works on light and dark themes alike. */}
      <div className="absolute inset-0 bg-black/50" aria-hidden />
      {/* Scroll container: centers short modals, lets tall ones be reached. */}
      <div
        className="absolute inset-0 flex items-center justify-center overflow-y-auto p-4"
        onMouseDown={(e) => {
          // click-outside closes (only when the backdrop area itself is pressed)
          if (e.target === e.currentTarget) onClose()
        }}
      >
        <div
          ref={panelRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby={title != null ? titleId : undefined}
          tabIndex={-1}
          className={cx(
            'relative z-10 my-auto flex max-h-[calc(100dvh-2rem)] w-full max-w-lg flex-col',
            'bg-surface border border-border rounded-card shadow-card',
            'focus-visible:outline-none',
            className,
          )}
        >
          {title != null && (
            <div className="flex shrink-0 items-center justify-between gap-4 px-5 py-4 border-b border-border">
              <h2 id={titleId} className="font-display text-lg font-bold text-fg">
                {title}
              </h2>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close dialog"
                className="rounded-btn p-1 text-fg-muted hover:text-fg hover:bg-bg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
              >
                <X aria-hidden className="size-5" />
              </button>
            </div>
          )}
          {/* Body scrolls; header/footer stay pinned. min-h-0 lets it shrink in the flex column. */}
          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
          {footer != null && (
            <div className="flex shrink-0 items-center justify-end gap-2 px-5 py-4 border-t border-border">
              {footer}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
