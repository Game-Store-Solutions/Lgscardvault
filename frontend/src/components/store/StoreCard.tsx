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

/** Initials fallback so a store with no logo still gets a deliberate mark. */
function monogram(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean)
  if (words.length === 0) return '?'
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase()
  return (words[0][0] + words[1][0]).toUpperCase()
}

/**
 * StoreCard — the marketplace directory card.
 *
 * Most stores have no logo or hero art, so the design leads with a monogram and
 * a restrained accent rather than a large empty media banner. Identity, blurb,
 * trust metadata, and a single CTA stack in a fixed rhythm so a row of cards
 * lines up regardless of how much copy each store has filled in.
 */
export function StoreCard({ store, index = 0, className }: StoreCardProps) {
  const accent = storeAccent(index, store.primaryColor)
  const logo = store.logoUrl?.trim()
  const blurb = store.tagline?.trim() || store.heroSubheading?.trim()
  const since = memberSince(store.createdAt)
  const verified = store.isActive !== false
  const location = [store.city, store.region].filter(Boolean).join(', ')

  return (
    <motion.div
      whileHover={{ y: -4 }}
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
        {/* Hairline accent — store identity without a heavy media block. */}
        <span aria-hidden className="h-1 w-full shrink-0" style={{ backgroundColor: accent }} />
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 h-32 opacity-[0.10] transition-opacity duration-500 group-hover:opacity-[0.16]"
          style={{ background: `radial-gradient(120% 100% at 15% 0%, ${accent} 0%, transparent 70%)` }}
        />

        <div className="relative flex flex-1 flex-col p-4 sm:p-5">
          <div className="flex items-start gap-3">
            <span
              className="grid size-12 shrink-0 place-items-center overflow-hidden rounded-xl border border-border bg-bg font-display text-sm font-black tracking-wide dark:border-white/10 dark:bg-white/[0.04]"
              style={{ color: accent }}
            >
              {logo ? (
                <img src={logo} alt="" className="size-full object-cover" loading="lazy" decoding="async" />
              ) : (
                monogram(store.name)
              )}
            </span>

            <div className="min-w-0 flex-1">
              <div className="flex items-start gap-1.5">
                <h3 className="min-w-0 font-display text-lg font-bold leading-snug tracking-tight text-fg">
                  <span className="line-clamp-1">{store.name}</span>
                </h3>
                {verified && (
                  <BadgeCheck aria-label="Verified store" className="mt-1 size-4 shrink-0 text-success-700" />
                )}
              </div>
              <p className="truncate text-xs text-fg-muted">/{store.slug}</p>
            </div>

            {store.featured && (
              <span
                className="shrink-0 rounded-full px-2 py-0.5 text-[0.6rem] font-black uppercase tracking-[0.14em]"
                style={{ backgroundColor: `${accent}1f`, color: accent }}
              >
                Featured
              </span>
            )}
          </div>

          <p className="mt-3.5 line-clamp-2 min-h-[2.5rem] text-sm leading-6 text-fg-muted">
            {blurb || 'Trading card singles and sealed product from a trusted local game store.'}
          </p>

          <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-fg-muted">
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
            {!location && !since && (
              <span className="inline-flex items-center gap-1">
                <StoreIcon aria-hidden className="size-3.5" />
                Independent store
              </span>
            )}
          </div>

          <div className="mt-4 flex items-center justify-between gap-3 border-t border-border pt-3.5 dark:border-white/10">
            <span className="text-[0.68rem] font-bold uppercase tracking-[0.14em] text-fg-muted">
              Shop inventory
            </span>
            <span className="inline-flex items-center gap-1.5 text-sm font-bold" style={{ color: accent }}>
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
      <div className="h-1 w-full bg-border/80" />
      <div className="p-4 sm:p-5">
        <div className="flex items-start gap-3">
          <div className="size-12 rounded-xl skeleton-shimmer" />
          <div className="flex-1 space-y-2">
            <div className="h-4 w-2/3 rounded skeleton-shimmer" />
            <div className="h-3 w-1/3 rounded skeleton-shimmer" />
          </div>
        </div>
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
