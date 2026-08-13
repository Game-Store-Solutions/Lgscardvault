import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { ArrowLeft } from 'lucide-react'
import { tv, type VariantProps } from 'tailwind-variants'
import { cx } from '../../lib/cx'

export const backButtonVariants = tv({
  base: cx(
    'inline-flex max-w-full items-center justify-center gap-2 rounded-full font-bold',
    'transition-[color,background-color,box-shadow,transform,border-color]',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40 focus-visible:ring-offset-2 focus-visible:ring-offset-bg',
    'active:scale-[0.98]',
  ),
  variants: {
    tone: {
      surface:
        'bg-surface text-fg shadow-sm ring-1 ring-black/[0.05] hover:bg-bg hover:text-brand-600 hover:ring-accent-500/35 dark:ring-white/10',
      overlay:
        'bg-surface/92 text-fg shadow-md ring-1 ring-black/[0.06] backdrop-blur-md hover:bg-surface hover:text-brand-600 hover:ring-accent-500/40 dark:ring-white/10',
      soft: 'border border-transparent bg-bg/80 text-fg-muted hover:bg-surface hover:text-brand-600 hover:ring-1 hover:ring-black/[0.05]',
    },
    size: {
      sm: 'h-9 px-3.5 text-xs',
      md: 'h-10 px-4 text-sm',
    },
  },
  defaultVariants: {
    tone: 'surface',
    size: 'sm',
  },
})

type BackButtonVariantProps = VariantProps<typeof backButtonVariants>

export interface BackButtonProps extends BackButtonVariantProps {
  to: string
  children: ReactNode
  className?: string
}

/** Pill back navigation — use instead of underlined text links. */
export function BackButton({ to, children, tone, size, className }: BackButtonProps) {
  return (
    <Link to={to} className={cx(backButtonVariants({ tone, size }), className)}>
      <ArrowLeft aria-hidden className="size-4 shrink-0" />
      <span className="truncate">{children}</span>
    </Link>
  )
}

export default BackButton
