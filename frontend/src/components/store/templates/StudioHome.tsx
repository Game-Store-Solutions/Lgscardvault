import { ArrowUpRight } from 'lucide-react'
import { Link } from 'react-router'
import { formatPrice } from '../../../api/client'
import { SpotlightCard } from '../../cards'
import { HeroPhotoBackgroundLayer } from '../hero/HeroBackdrop'
import { DEFAULT_PRIMARY, HeroLogo } from '../StoreHero'
import { SpotlightRailSkeleton } from '../../ui'
import { STOREFRONT_SHELL } from '../../../lib/layoutShell'
import { cx } from '../../../lib/cx'
import type { StoreHomeLayoutProps } from './types'

export function StudioHome({ chrome, slots }: StoreHomeLayoutProps) {
  const heading = chrome.heading
  const primary = chrome.primaryColor?.trim() || DEFAULT_PRIMARY
  const hasImage = Boolean(chrome.heroImageUrl?.trim())
  const selected = chrome.spotlightItems.slice(0, 6)
  const activeGame = chrome.gameOptions.find((g) => g.code === chrome.gameFilter)?.name

  return (
    <div className="storefront-studio storefront-atmosphere relative" data-storefront-template="studio">
      <section className="relative isolate min-h-[84vh] overflow-hidden bg-bg">
        <HeroPhotoBackgroundLayer
          heroImageUrl={chrome.heroImageUrl}
          hasImage={hasImage}
          primary={primary}
          imageOpacity={chrome.heroImageOpacity ?? 100}
          imagePositionX={chrome.heroImagePositionX ?? 50}
          imagePositionY={chrome.heroImagePositionY ?? 50}
          imagePositionMobileX={chrome.heroImagePositionMobileX}
          imagePositionMobileY={chrome.heroImagePositionMobileY}
        />
        <div className="absolute inset-0 bg-gradient-to-t from-bg via-bg/25 to-transparent" aria-hidden />
        <div className="relative z-[1] mx-auto flex min-h-[84vh] w-full max-w-[96rem] flex-col justify-end px-6 pb-14 pt-20 sm:px-12 lg:px-20">
          <p className="studio-kicker text-fg">{chrome.tagline?.trim() || chrome.name}</p>
          <h1 className="studio-headline mt-4 max-w-3xl text-fg">{heading}</h1>
          <p className="mt-4 max-w-md text-sm leading-relaxed text-fg/80 sm:text-base">{chrome.subheading}</p>
          <div className="mt-8 flex flex-wrap items-center gap-6">
            <button
              type="button"
              onClick={chrome.onShopSingles}
              className="text-sm font-semibold tracking-wide text-fg underline decoration-fg/30 underline-offset-8 hover:decoration-fg"
            >
              Shop singles
            </button>
            {chrome.locationLabel ? (
              <span className="text-xs uppercase tracking-[0.18em] text-fg-muted">{chrome.locationLabel}</span>
            ) : null}
            <HeroLogo logoUrl={chrome.logoUrl} className="size-9" />
          </div>
        </div>
      </section>

      {slots.promo}

      <section className={cx(STOREFRONT_SHELL, 'grid gap-12 py-16 lg:grid-cols-[minmax(0,13rem)_minmax(0,1fr)] lg:py-24')}>
        <div>
          <p className="studio-kicker text-fg-muted">Index</p>
          <ol className="mt-6 space-y-3">
            {chrome.shortcuts.map((item, index) => {
              const n = String(index + 1).padStart(2, '0')
              const className =
                'group flex items-center justify-between gap-3 border-b border-border/70 py-2 text-sm text-fg hover:text-brand-600'
              const body = (
                <>
                  <span>
                    <span className="mr-3 text-[11px] uppercase tracking-[0.18em] text-fg-muted">{n}</span>
                    {item.label}
                  </span>
                  <ArrowUpRight aria-hidden className="size-3.5 opacity-0 transition-opacity group-hover:opacity-100" />
                </>
              )
              return item.to ? (
                <li key={item.label}>
                  <Link to={item.to} className={className}>
                    {body}
                  </Link>
                </li>
              ) : (
                <li key={item.label}>
                  <button type="button" onClick={item.onClick} className={cx(className, 'w-full text-left')}>
                    {body}
                  </button>
                </li>
              )
            })}
          </ol>
        </div>
        <div>
          <p className="studio-kicker text-fg-muted">The shop</p>
          <dl className="mt-6 grid grid-cols-3 gap-6 text-sm">
            <div>
              <dt className="text-fg-muted">Listings</dt>
              <dd className="mt-1 font-display text-3xl font-bold text-fg">{chrome.stats.listings}</dd>
            </div>
            <div>
              <dt className="text-fg-muted">Cards</dt>
              <dd className="mt-1 font-display text-3xl font-bold text-fg">{chrome.stats.cards}</dd>
            </div>
            <div>
              <dt className="text-fg-muted">Sets</dt>
              <dd className="mt-1 font-display text-3xl font-bold text-fg">{chrome.stats.sets}</dd>
            </div>
          </dl>
          {chrome.actions ? <div className="mt-8 flex flex-wrap gap-3">{chrome.actions}</div> : null}
        </div>
      </section>

      {slots.games ? <div className={cx(STOREFRONT_SHELL, 'pb-6')}>{slots.games}</div> : null}

      {chrome.spotlightEnabled && (chrome.spotlightLoading || selected.length > 0) && (
        <section className={cx(STOREFRONT_SHELL, 'pb-20')}>
          <p className="studio-kicker text-fg-muted">Selected work{activeGame ? ` · ${activeGame}` : ''}</p>
          <h2 className="mt-3 max-w-xl font-display text-3xl font-semibold tracking-tight text-fg sm:text-4xl">
            Case cards, staples, and what is actually in stock.
          </h2>
          <p className="mt-3 max-w-lg text-sm text-fg-muted">
            {(chrome.pinnedIds.length ?? 0) > 0
              ? `Curated picks plus singles at or above ${formatPrice(chrome.spotlightMinPriceCents)}`
              : `Live singles at or above ${formatPrice(chrome.spotlightMinPriceCents)}`}
          </p>
          {chrome.spotlightLoading ? (
            <div className="mt-10">
              <SpotlightRailSkeleton />
            </div>
          ) : (
            <div className="mt-10 grid grid-cols-2 gap-8 sm:grid-cols-3">
              {selected.map((item, i) => (
                <SpotlightCard
                  key={item.id}
                  item={item}
                  slug={chrome.slug}
                  ribbon={chrome.pinnedIds.includes(item.id) ? 'Picked' : i === 0 ? 'Featured' : undefined}
                />
              ))}
            </div>
          )}
        </section>
      )}

      {slots.sealed ? (
        <div className="border-y border-border/70 bg-surface/40">
          <div className={cx(STOREFRONT_SHELL, 'py-16')}>{slots.sealed}</div>
        </div>
      ) : null}

      <section className={cx(STOREFRONT_SHELL, 'py-16 sm:py-24')}>
        <p className="studio-kicker text-fg-muted">Inventory</p>
        <h2 className="mt-3 font-display text-3xl font-semibold tracking-tight text-fg sm:text-4xl">Browse singles</h2>
        <p className="mt-3 max-w-lg text-sm text-fg-muted">
          Search, filters, and prices are the same catalog as the boxed shop. Cart and checkout do not change.
        </p>
        <div className="mt-10">{slots.browse}</div>
      </section>
      {slots.filtersDrawer}
    </div>
  )
}
