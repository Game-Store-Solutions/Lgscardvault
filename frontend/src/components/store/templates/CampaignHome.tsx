import { ArrowRight, ChevronLeft, ChevronRight } from 'lucide-react'
import { Link } from 'react-router'
import { formatPrice } from '../../../api/client'
import { SpotlightCard } from '../../cards'
import { HeroPhotoBackgroundLayer } from '../hero/HeroBackdrop'
import { DEFAULT_PRIMARY, HeroLogo } from '../StoreHero'
import { buttonVariants, SpotlightRailSkeleton } from '../../ui'
import { STOREFRONT_SHELL } from '../../../lib/layoutShell'
import { cx } from '../../../lib/cx'
import type { StoreHomeLayoutProps } from './types'

export function CampaignHome({ chrome, slots }: StoreHomeLayoutProps) {
  const heading = chrome.heading
  const primary = chrome.primaryColor?.trim() || DEFAULT_PRIMARY
  const hasImage = Boolean(chrome.heroImageUrl?.trim())
  const games = chrome.gameOptions.length > 0 ? chrome.gameOptions : [{ code: 'singles', name: 'Singles' }]
  const marquee = [...games, ...games, ...games, ...games]
  const featured = chrome.spotlightItems.slice(0, 3)
  const rest = chrome.spotlightItems.slice(3)
  const activeGame = chrome.gameOptions.find((g) => g.code === chrome.gameFilter)?.name

  return (
    <div className="storefront-campaign storefront-atmosphere relative" data-storefront-template="campaign">
      <section className="relative isolate min-h-[78vh] overflow-hidden bg-fg text-white">
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
        <div className="absolute inset-0 bg-gradient-to-t from-black via-black/55 to-black/20" aria-hidden />
        <div className="relative z-[1] mx-auto flex min-h-[78vh] w-full max-w-[96rem] flex-col justify-end px-4 pb-12 pt-16 sm:px-8 sm:pb-16 lg:px-12">
          <div className="flex flex-wrap items-center gap-3 text-[11px] font-bold uppercase tracking-[0.22em] text-white/70">
            <HeroLogo logoUrl={chrome.logoUrl} className="size-10" glass />
            <span>{chrome.name}</span>
            {chrome.locationLabel ? <span aria-hidden>·</span> : null}
            {chrome.locationLabel ? <span>{chrome.locationLabel}</span> : null}
            {chrome.verified ? <span className="rounded-full bg-white/15 px-2 py-0.5 text-white">Verified</span> : null}
          </div>
          {chrome.tagline ? (
            <p className="mt-6 text-xs font-bold uppercase tracking-[0.28em] text-white/80">{chrome.tagline}</p>
          ) : null}
          <h1 className="campaign-headline mt-4 max-w-5xl text-white">{heading}</h1>
          <p className="mt-5 max-w-xl text-base leading-relaxed text-white/80 sm:text-lg">{chrome.subheading}</p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <button type="button" className={buttonVariants({ size: 'lg' })} onClick={chrome.onShopSingles}>
              Shop in-stock singles
              <ArrowRight aria-hidden className="size-4" />
            </button>
            {chrome.actions}
          </div>
          <p className="mt-8 text-sm text-white/70">
            <span className="font-bold text-white">{chrome.stats.listings}</span> listings
            <span aria-hidden className="mx-2 text-white/40">
              ·
            </span>
            <span className="font-bold text-white">{chrome.stats.cards}</span> cards
            <span aria-hidden className="mx-2 text-white/40">
              ·
            </span>
            <span className="font-bold text-white">{chrome.stats.sets}</span> sets
          </p>
        </div>
      </section>

      <div className="overflow-hidden border-y border-border bg-fg py-3 text-white">
        <div className="store-marquee-track flex w-max gap-10 whitespace-nowrap px-6 text-xs font-bold uppercase tracking-[0.28em]">
          {marquee.map((game, i) => (
            <button
              key={`${game.code}-${i}`}
              type="button"
              onClick={() => chrome.gameOptions.length > 1 && chrome.onGameChange(game.code)}
              className={cx(
                'transition-colors',
                chrome.gameFilter === game.code ? 'text-white' : 'text-white/55 hover:text-white',
              )}
            >
              {game.name}
            </button>
          ))}
        </div>
      </div>

      {slots.promo}

      <section className="border-b border-border bg-surface">
        <div className={cx(STOREFRONT_SHELL, 'flex flex-wrap items-center gap-x-8 gap-y-3 py-6')}>
          {chrome.shortcuts.map((item) =>
            item.to ? (
              <Link
                key={item.label}
                to={item.to}
                className="group inline-flex items-center gap-2 text-sm font-bold uppercase tracking-[0.16em] text-fg hover:text-brand-600"
              >
                {item.label}
                <ArrowRight aria-hidden className="size-3.5 transition-transform group-hover:translate-x-0.5" />
              </Link>
            ) : (
              <button
                key={item.label}
                type="button"
                onClick={item.onClick}
                className="group inline-flex items-center gap-2 text-sm font-bold uppercase tracking-[0.16em] text-fg hover:text-brand-600"
              >
                {item.label}
                <ArrowRight aria-hidden className="size-3.5 transition-transform group-hover:translate-x-0.5" />
              </button>
            ),
          )}
        </div>
      </section>

      {slots.games ? <div className={cx(STOREFRONT_SHELL, 'pt-10')}>{slots.games}</div> : null}

      {chrome.spotlightEnabled && (chrome.spotlightLoading || featured.length > 0) && (
        <section className="bg-fg py-16 text-white sm:py-20">
          <div className={STOREFRONT_SHELL}>
            <p className="text-xs font-bold uppercase tracking-[0.28em] text-white/55">This week’s boxes and staples</p>
            <h2 className="mt-3 font-display text-4xl font-extrabold tracking-tight sm:text-6xl">
              Featured{activeGame ? ` · ${activeGame}` : ''}
            </h2>
            <p className="mt-3 max-w-xl text-sm text-white/70">
              {(chrome.pinnedIds.length ?? 0) > 0
                ? `Picked singles plus stock at or above ${formatPrice(chrome.spotlightMinPriceCents)}`
                : `Live inventory at or above ${formatPrice(chrome.spotlightMinPriceCents)}`}
            </p>
            {chrome.spotlightLoading ? (
              <div className="mt-10">
                <SpotlightRailSkeleton />
              </div>
            ) : (
              <>
                <div className="mt-10 grid gap-8 sm:grid-cols-3">
                  {featured.map((item, i) => (
                    <SpotlightCard
                      key={item.id}
                      item={item}
                      slug={chrome.slug}
                      ribbon={chrome.pinnedIds.includes(item.id) ? 'Picked' : i === 0 ? 'Featured' : undefined}
                    />
                  ))}
                </div>
                {rest.length > 0 && (
                  <div className="relative mt-12">
                    <button
                      type="button"
                      onClick={() => chrome.scrollRail(-1)}
                      aria-label="Scroll spotlight left"
                      className="absolute left-1 top-[42%] z-20 hidden size-10 -translate-y-1/2 place-items-center rounded-full border border-white/20 bg-white/10 text-white sm:grid"
                    >
                      <ChevronLeft aria-hidden className="size-5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => chrome.scrollRail(1)}
                      aria-label="Scroll spotlight right"
                      className="absolute right-1 top-[42%] z-20 hidden size-10 -translate-y-1/2 place-items-center rounded-full border border-white/20 bg-white/10 text-white sm:grid"
                    >
                      <ChevronRight aria-hidden className="size-5" />
                    </button>
                    <div
                      ref={chrome.railRef}
                      className="store-rail-scroll flex snap-x snap-mandatory gap-4 overflow-x-auto pb-2 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
                    >
                      {rest.map((item) => (
                        <SpotlightCard key={item.id} item={item} slug={chrome.slug} />
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </section>
      )}

      {slots.sealed ? <div className={cx(STOREFRONT_SHELL, 'py-12')}>{slots.sealed}</div> : null}

      <div className={cx(STOREFRONT_SHELL, 'pb-16 pt-4')}>{slots.browse}</div>
      {slots.filtersDrawer}
    </div>
  )
}
