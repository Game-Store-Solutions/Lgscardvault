import { useState, type ReactNode } from 'react'
import { ChevronDown } from 'lucide-react'
import { cx } from '../../lib/cx'

export function AccountAccordion({
  id,
  title,
  subtitle,
  badge,
  defaultOpen = false,
  children,
}: {
  id: string
  title: ReactNode
  subtitle?: ReactNode
  badge?: ReactNode
  defaultOpen?: boolean
  children: ReactNode
}) {
  const [open, setOpen] = useState(defaultOpen)
  const panelId = `${id}-panel`

  return (
    <li>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((current) => !current)}
        className="flex w-full items-start gap-3 py-4 text-left"
      >
        <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg text-fg-muted">
          <ChevronDown aria-hidden className={cx('size-5 transition-transform', open ? 'rotate-0' : '-rotate-90')} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-bold text-fg">{title}</span>
          {subtitle != null ? <span className="mt-0.5 block text-sm text-fg-muted">{subtitle}</span> : null}
        </span>
        {badge}
      </button>
      {open ? (
        <div id={panelId} className="pb-4 pl-11">
          {children}
        </div>
      ) : null}
    </li>
  )
}
