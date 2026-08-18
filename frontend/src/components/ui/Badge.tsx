/* eslint-disable react-refresh/only-export-components */
import type { HTMLAttributes } from 'react'
import { tv, type VariantProps } from 'tailwind-variants'
import { cx } from '../../lib/cx'

export const badgeVariants = tv({
  base: 'inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-bold tracking-[0.01em]',
  variants: {
    tone: {
      brand: 'bg-brand-50 text-brand-700',
      success: 'bg-success-50 text-success-700',
      warning: 'bg-warning-50 text-warning-700',
      danger: 'bg-danger-50 text-danger-700',
      neutral: 'bg-bg text-fg-muted border border-border',
    },
  },
  defaultVariants: {
    tone: 'neutral',
  },
})

export interface BadgeProps
  extends HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

export function Badge({ tone, className, ...props }: BadgeProps) {
  return <span className={cx(badgeVariants({ tone }), className)} {...props} />
}
