import { Link } from 'react-router'
import { ArrowRight, BadgeCheck, CalendarDays, Store as StoreIcon, UserRound } from 'lucide-react'
import type { Store } from '../../api/types'
import { cx } from '../../lib/cx'
import { accentTint, memberSince, storeAccent } from '../../lib/storeAccent'

export interface StoreCardProps {
  store: Store
  /** Index in the list — seeds the accent palette when no brand color is set. */
  index?: number
  className?: string
}

/**
 * StoreCard — a clean marketplace directory card. A slim brand-accent bar gives
 * each storefront identity without a heavy media block; below sits a logo
 * avatar, the store name (heading font), a one-line differentiator, honest
 * trust signals (verified / member-since / owner), and a single clear CTA.
 * Hybrid border + soft shadow; lifts on hover with no layout shift.
 */
export function StoreCard({ store, index = 0, className }: StoreCardProps) {
  const accent = storeAccent(index, store.primaryColor)
  const hasLogo = Boolean(store.logoUrl?.trim())
  const blurb = store.tagline?.trim() || store.heroSubheading?.trim()
  const since = memberSince(store.createdAt)
  const verified = store.isActive !== false

  return (
    <Link
      to={`/s/${store.slug}`}
      className={cx(
        'group flex h-full flex-col overflow-hidden rounded-card border border-border bg-surface shadow-card dark:glass-card ui-lift',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 focus-visible:ring-offset-bg',
        className,
      )}
    >
      {/* Slim brand-accent bar */}
      <span aria-hidden className="h-1.5 w-full" style={{ backgroundColor: accent }} />

      <div className="flex flex-1 flex-col p-5">
        <div className="flex items-center gap-3">
          <span
            className="grid size-12 flex-shrink-0 place-items-center overflow-hidden rounded-btn"
            style={{ backgroundColor: hasLogo ? undefined : accentTint(accent) }}
          >
            {hasLogo ? (
              <img src={store.logoUrl as string} alt="" className="size-full object-cover" />
            ) : (
              <StoreIcon aria-hidden className="size-6" style={{ color: accent }} />
            )}
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1">
              <h3 className="truncate font-display text-lg font-bold tracking-tight text-fg group-hover:text-brand-600">
                {store.name}
              </h3>
              {verified && (
                <BadgeCheck aria-label="Verified store" className="size-4 flex-shrink-0" style={{ color: accent }} />
              )}
            </div>
            <p className="truncate text-sm text-fg-muted">/{store.slug}</p>
          </div>
        </div>

        <p className="mt-4 line-clamp-2 flex-1 text-sm text-fg-muted">
          {blurb || 'Magic: The Gathering singles and sealed product.'}
        </p>

        {/* Trust signals — muted metadata; hierarchy via weight/color, not size */}
        <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-fg-muted">
          {verified && (
            <span className="inline-flex items-center gap-1 font-medium text-success-700">
              <BadgeCheck aria-hidden className="size-3.5" />
              Verified
            </span>
          )}
          {since && (
            <span className="inline-flex items-center gap-1">
              <CalendarDays aria-hidden className="size-3.5" />
              Since {since}
            </span>
          )}
          {store.owner?.displayName && (
            <span className="inline-flex min-w-0 items-center gap-1">
              <UserRound aria-hidden className="size-3.5 shrink-0" />
              <span className="truncate">{store.owner.displayName}</span>
            </span>
          )}
        </div>

        <div className="mt-4 flex items-center justify-between border-t border-border pt-4">
          <span className="text-sm text-fg-muted">View inventory</span>
          <span className="inline-flex items-center gap-1 text-sm font-bold text-brand-600">
            Visit store
            <ArrowRight aria-hidden className="size-4 transition-transform group-hover:translate-x-0.5" />
          </span>
        </div>
      </div>
    </Link>
  )
}

/** Skeleton placeholder matching StoreCard's footprint, for loading states. */
export function StoreCardSkeleton({ className }: { className?: string }) {
  return (
    <div className={cx('overflow-hidden rounded-card border border-border bg-surface shadow-card dark:glass-card', className)}>
      <div className="h-1.5 w-full bg-border/80" />
      <div className="p-5">
        <div className="flex items-center gap-3">
          <div className="size-12 rounded-btn skeleton-shimmer" />
          <div className="flex-1 space-y-2">
            <div className="h-4 w-2/3 rounded skeleton-shimmer" />
            <div className="h-3 w-1/3 rounded skeleton-shimmer" />
          </div>
        </div>
        <div className="mt-4 space-y-2">
          <div className="h-3 w-full rounded skeleton-shimmer" />
          <div className="h-3 w-4/5 rounded skeleton-shimmer" />
        </div>
        <div className="mt-6 h-4 w-1/2 rounded skeleton-shimmer" />
      </div>
    </div>
  )
}

export default StoreCard
