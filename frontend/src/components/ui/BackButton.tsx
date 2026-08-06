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
        'border border-border bg-surface text-fg shadow-sm hover:border-brand-300 hover:bg-bg hover:text-brand-600',
      overlay:
        'border border-border/80 bg-surface/92 text-fg shadow-md backdrop-blur-md hover:border-brand-400/60 hover:bg-surface hover:text-brand-600',
      soft: 'border border-transparent bg-bg/80 text-fg-muted hover:border-border hover:bg-surface hover:text-brand-600',
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
