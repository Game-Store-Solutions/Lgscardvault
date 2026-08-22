import { Link } from 'react-router'
import { cx } from '../../lib/cx'

const LINKS = [
  { to: '/privacy', label: 'Privacy' },
  { to: '/terms', label: 'Terms' },
  { to: '/pickup', label: 'Pickup & refunds' },
  { to: '/merchant-terms', label: 'Merchant terms' },
] as const

export function LegalLinks({ className, compact = false }: { className?: string; compact?: boolean }) {
  return (
    <nav aria-label="Legal" className={cx('flex flex-wrap items-center gap-x-3 gap-y-1', className)}>
      {LINKS.map((link) => (
        <Link
          key={link.to}
          to={link.to}
          className={cx(
            'hover:text-brand-600 hover:underline',
            compact ? 'text-[11px] font-medium text-fg-muted' : 'text-xs font-medium text-fg-muted',
          )}
        >
          {link.label}
        </Link>
      ))}
    </nav>
  )
}
