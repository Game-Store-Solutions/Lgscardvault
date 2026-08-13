import { Link } from 'react-router'
import { useTheme } from '../hooks'
import { cx } from '../lib/cx'

type BrandLogoProps = {
  /** Visual size of the mark. */
  size?: 'sm' | 'md' | 'lg' | 'hero'
  /**
   * `light` = white-background mark, `dark` = black-background mark,
   * `auto` = light mark in light theme, dark mark in dark theme.
   */
  variant?: 'dark' | 'light' | 'auto'
  /** Show “LGS Card Vault” wordmark beside the mark. Logo art already includes type — keep off for hero. */
  withWordmark?: boolean
  className?: string
  /** When set, wraps the logo in a link. Pass null to render a plain mark. */
  to?: string | null
}

const SIZE = {
  sm: 'size-8',
  md: 'size-9',
  lg: 'size-12',
  hero: 'h-48 w-48 sm:h-64 sm:w-64',
} as const

function LogoImg({
  src,
  size,
  alt,
  className,
  decorative = false,
}: {
  src: string
  size: keyof typeof SIZE
  alt: string
  className?: string
  decorative?: boolean
}) {
  return (
    <img
      src={src}
      alt={decorative ? '' : alt}
      aria-hidden={decorative || undefined}
      className={cx(
        SIZE[size],
        'shrink-0 rounded-[20%] object-cover shadow-sm ring-1 ring-black/10 dark:ring-white/10',
        className,
      )}
      width={size === 'hero' ? 256 : size === 'lg' ? 48 : size === 'md' ? 36 : 32}
      height={size === 'hero' ? 256 : size === 'lg' ? 48 : size === 'md' ? 36 : 32}
      decoding="async"
    />
  )
}

/**
 * Official LGS Card Vault lockup.
 * Light theme → white-background icon. Dark theme → dark icon.
 */
export function BrandLogo({
  size = 'md',
  variant = 'auto',
  withWordmark = false,
  className,
  to = '/',
}: BrandLogoProps) {
  // Keep theme subscription so forced variants / callers stay consistent.
  useTheme()
  const alt = withWordmark || to === null ? 'LGS Card Vault' : ''

  const mark = (
    <span className={cx('inline-flex items-center gap-2.5', className)}>
      {variant === 'auto' ? (
        <>
          {/* White-bg mark for light theme */}
          <LogoImg src="/brand/logo-light.png" size={size} alt={alt} className="dark:hidden" />
          <LogoImg src="/brand/logo-dark.png" size={size} alt="" className="hidden dark:block" decorative />
        </>
      ) : (
        <LogoImg
          src={variant === 'light' ? '/brand/logo-light.png' : '/brand/logo-dark.png'}
          size={size}
          alt={alt}
        />
      )}
      {withWordmark && (
        <span className="hidden font-display text-lg font-bold tracking-tight text-fg sm:inline">
          LGS Card Vault
        </span>
      )}
    </span>
  )

  if (to === null) return mark
  return (
    <Link to={to} className="inline-flex items-center" aria-label="LGS Card Vault home">
      {mark}
    </Link>
  )
}
