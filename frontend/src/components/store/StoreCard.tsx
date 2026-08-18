import { Link } from 'react-router'
import { motion } from 'framer-motion'
import { ArrowRight, BadgeCheck, CalendarDays, MapPin, Store as StoreIcon } from 'lucide-react'
import type { Store } from '../../api/types'
import { cx } from '../../lib/cx'
import { memberSince, storeAccent } from '../../lib/storeAccent'
import { EASE_PREMIUM } from '../motion'

export interface StoreCardProps {
  store: Store
  /** Index in the list — seeds the accent palette when no brand color is set. */
  index?: number
  className?: string
}

/**
 * StoreCard — the marketplace directory card.
 *
 * The store's own artwork (hero image, else logo, else an accent wash) fills a
 * cinematic banner so each storefront is recognisable at a glance, then the body
 * keeps the details a shopper actually decides on: name, blurb, location, and
 * how long they've been on the platform.
 */
export function StoreCard({ store, index = 0, className }: StoreCardProps) {
  const accent = storeAccent(index, store.primaryColor)
  const logo = store.logoUrl?.trim()
  const banner = store.heroImageUrl?.trim() || logo
  const blurb = store.tagline?.trim() || store.heroSubheading?.trim()
  const since = memberSince(store.createdAt)
  const verified = store.isActive !== false
  const location = [store.city, store.region].filter(Boolean).join(', ')

  return (
    <motion.div
      whileHover={{ y: -5 }}
      whileTap={{ scale: 0.995 }}
      transition={{ duration: 0.24, ease: EASE_PREMIUM }}
      className={cx('h-full', className)}
    >
      <Link
        to={`/s/${store.slug}`}
        className={cx(
          'group relative flex h-full flex-col overflow-hidden rounded-card border border-border bg-surface',
          'shadow-card transition-[border-color,box-shadow] hover:border-fg/15 hover:shadow-lg',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 focus-visible:ring-offset-bg',
          'dark:border-white/10 dark:bg-white/[0.03] dark:hover:border-white/20',
        )}
      >
        {/* Banner — store art when available, otherwise a branded accent wash. */}
        <div className="relative h-28 overflow-hidden sm:h-32">
          <div
            aria-hidden
            className="absolute inset-0"
            style={{ background: `linear-gradient(135deg, ${accent} 0%, ${accent}22 62%, transparent 100%)` }}
          />
          {banner && (
            <img
              src={banner}
              alt=""
              aria-hidden
              loading="lazy"
              decoding="async"
              className="absolute inset-0 size-full object-cover opacity-55 transition-transform duration-[600ms] ease-out group-hover:scale-[1.05]"
            />
          )}
          <div aria-hidden className="absolute inset-0 bg-gradient-to-t from-surface via-surface/45 to-transparent dark:from-[#0d0d10] dark:via-[#0d0d10]/45" />

          {store.featured && (
            <span className="absolute right-3 top-3 rounded-full bg-black/55 px-2.5 py-1 text-[0.62rem] font-bold uppercase tracking-[0.16em] text-white backdrop-blur-sm">
              Featured
            </span>
          )}
        </div>

        {/* Logo chip straddles the banner edge so the identity leads the card. */}
        <div className="-mt-8 px-4 sm:px-5">
          <span
            className="grid size-14 place-items-center overflow-hidden rounded-2xl border border-border bg-surface shadow-md dark:border-white/12 dark:bg-[#15151a]"
            style={{ boxShadow: `0 12px 30px -16px ${accent}` }}
          >
            {logo ? (
              <img src={logo} alt="" className="size-full object-cover" loading="lazy" decoding="async" />
            ) : (
              <StoreIcon aria-hidden className="size-6" style={{ color: accent }} />
            )}
          </span>
        </div>

        <div className="flex flex-1 flex-col px-4 pb-4 pt-3 sm:px-5 sm:pb-5">
          <div className="flex items-start gap-1.5">
            <h3 className="min-w-0 flex-1 font-display text-lg font-bold leading-snug tracking-tight text-fg">
              <span className="line-clamp-1">{store.name}</span>
            </h3>
            {verified && (
              <BadgeCheck
                aria-label="Verified store"
                className="mt-0.5 size-4 shrink-0 text-success-700"
              />
            )}
          </div>
          <p className="mt-0.5 truncate text-xs text-fg-muted">/{store.slug}</p>

          <p className="mt-3 line-clamp-2 flex-1 text-sm leading-6 text-fg-muted">
            {blurb || 'Trading card singles and sealed product from a trusted local game store.'}
          </p>

          <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-fg-muted">
            {location && (
              <span className="inline-flex min-w-0 items-center gap-1">
                <MapPin aria-hidden className="size-3.5 shrink-0" />
                <span className="truncate">{location}</span>
              </span>
            )}
            {since && (
              <span className="inline-flex items-center gap-1">
                <CalendarDays aria-hidden className="size-3.5" />
                Since {since}
              </span>
            )}
          </div>

          <div className="mt-4 flex items-center justify-between gap-3 border-t border-border pt-4 dark:border-white/10">
            <span className="text-xs font-semibold uppercase tracking-[0.14em] text-fg-muted">
              Shop inventory
            </span>
            <span
              className="inline-flex items-center gap-1.5 text-sm font-bold text-fg transition-colors"
              style={{ color: accent }}
            >
              Visit
              <ArrowRight aria-hidden className="size-4 transition-transform duration-300 group-hover:translate-x-1" />
            </span>
          </div>
        </div>
      </Link>
    </motion.div>
  )
}

/** Skeleton placeholder matching StoreCard's footprint, for loading states. */
export function StoreCardSkeleton({ className }: { className?: string }) {
  return (
    <div
      className={cx(
        'overflow-hidden rounded-card border border-border bg-surface shadow-card dark:border-white/10 dark:bg-white/[0.03]',
        className,
      )}
    >
      <div className="h-28 w-full skeleton-shimmer sm:h-32" />
      <div className="-mt-8 px-4 sm:px-5">
        <div className="size-14 rounded-2xl skeleton-shimmer" />
      </div>
      <div className="px-4 pb-5 pt-3 sm:px-5">
        <div className="h-4 w-2/3 rounded skeleton-shimmer" />
        <div className="mt-2 h-3 w-1/3 rounded skeleton-shimmer" />
        <div className="mt-4 space-y-2">
          <div className="h-3 w-full rounded skeleton-shimmer" />
          <div className="h-3 w-4/5 rounded skeleton-shimmer" />
        </div>
        <div className="mt-5 h-4 w-1/2 rounded skeleton-shimmer" />
      </div>
    </div>
  )
}

export default StoreCard
