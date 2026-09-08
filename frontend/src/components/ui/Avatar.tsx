/* eslint-disable react-refresh/only-export-components */
import { tv, type VariantProps } from 'tailwind-variants'
import { cx } from '../../lib/cx'

export const avatarVariants = tv({
  base: cx(
    'inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full',
    'bg-brand-50 text-brand-700 font-bold uppercase select-none',
  ),
  variants: {
    size: {
      sm: 'size-7 text-xs',
      md: 'size-9 text-sm',
      lg: 'size-12 text-base',
      profile: 'size-32 text-2xl sm:size-40 sm:text-3xl',
    },
  },
  defaultVariants: { size: 'md' },
})

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2)
  return (parts[0][0] ?? '') + (parts[parts.length - 1][0] ?? '')
}

export interface AvatarProps extends VariantProps<typeof avatarVariants> {
  name: string
  src?: string
  className?: string
}

export function Avatar({ name, src, size, className }: AvatarProps) {
  return (
    <span className={cx(avatarVariants({ size }), className)} aria-hidden={false} title={name}>
      {src ? (
        <img src={src} alt={name} className="size-full object-cover" />
      ) : (
        <span>{initials(name)}</span>
      )}
    </span>
  )
}
