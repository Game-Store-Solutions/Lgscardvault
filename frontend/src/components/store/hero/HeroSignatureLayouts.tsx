import type { ReactNode } from 'react'
import { BadgeCheck, Box, Dices, Sparkles } from 'lucide-react'
import { cx } from '../../../lib/cx'
import { clampHeroImageOpacity, heroImageOpacityCss } from '../../../lib/heroImageOpacity'
import { isDarkHex, storeFrameClass } from '../../../lib/storeTheme'
import type { StoreHeroProps } from '../StoreHero'
import { HeroLogo, HeroTagline, useHeroTokens } from '../StoreHero'
import { HeroOptionalPhoto } from './HeroBackdrop'
import { FloatingCardsLayer, HeroCardImg } from './FloatingCardsLayer'
import { CommunityBoard } from '../events/CommunityBoard'
import type { HeroLayout } from '../../../api/types'
import { GENERIC_MTG_CARDS } from './heroCardPool'

type Tokens = ReturnType<typeof useHeroTokens>

function HeroShell({
  props,
  tokens,
  children,
  className,
  minClass = 'min-h-[22rem]',
  photoScrim = 'token',
  layout,
}: {
  props: StoreHeroProps
  tokens: Tokens
  children: ReactNode
  className?: string
  minClass?: string
  photoScrim?: 'dark' | 'token' | 'light' | 'none'
  layout?: HeroLayout
}) {
  const { primary, hasImage } = tokens
  const { heroImageUrl, heroImageOpacity, className: outerClass } = props
  return (
    <div className={cx('rounded-card', storeFrameClass('hero'), outerClass)}>
      <div
        className={cx(
          'relative isolate overflow-hidden rounded-[inherit]',
          minClass,
          className,
        )}
      >
        <HeroOptionalPhoto
          layout={layout}
          heroImageUrl={heroImageUrl}
          hasImage={hasImage}
          primary={primary}
          scrim={photoScrim}
          imageOpacity={clampHeroImageOpacity(heroImageOpacity)}
        />
        <div className="relative z-[1]">{children}</div>
      </div>
    </div>
  )
}

function IdentityHeader({
  props,
  tokens,
  light,
}: {
  props: StoreHeroProps
  tokens: Tokens
  light?: boolean
}) {
  const { accent, heading } = tokens
  const { logoUrl, tagline, heroSubheading, verified } = props
  return (
    <div className={cx('space-y-3', light ? 'text-white' : 'text-fg')}>
      <div className="flex flex-wrap items-center gap-3">
        <HeroLogo logoUrl={logoUrl} className="size-14" glass={light} />
        {verified ? (
          <span
            className={cx(
              'inline-flex items-center gap-1 text-xs font-bold uppercase tracking-wide',
              light ? 'text-emerald-200' : 'text-brand-600',
            )}
          >
            <BadgeCheck aria-hidden className="size-4" />
            Verified
          </span>
        ) : null}
        {tagline?.trim() ? <HeroTagline tagline={tagline.trim()} accent={accent} light={light} /> : null}
      </div>
      <h1
        className={cx(
          'font-display text-2xl font-bold tracking-tight sm:text-3xl lg:text-4xl',
          light ? 'text-white drop-shadow-sm' : 'text-fg',
        )}
      >
        {heading}
      </h1>
      {heroSubheading?.trim() ? (
        <p className={cx('max-w-xl text-sm leading-relaxed sm:text-base', light ? 'text-white/85' : 'text-fg-muted')}>
          {heroSubheading}
        </p>
      ) : null}
      {props.actions ? <div className="flex flex-wrap gap-2 pt-1">{props.actions}</div> : null}
    </div>
  )
}

/** Classic full-height photo banner with gradients (original cinematic hero). */
export function CinematicHero({ props, tokens }: { props: StoreHeroProps; tokens: Tokens }) {
  const { primary, accent, heading, hasImage } = tokens
  const { heroImageUrl, heroImageOpacity, logoUrl, tagline, heroSubheading, actions, className } = props
  const photoOpacity = heroImageOpacityCss(clampHeroImageOpacity(heroImageOpacity))

  return (
    <div className={cx('rounded-card', storeFrameClass('hero'), className)}>
    <div
      className={cx(
        'relative isolate flex min-h-64 items-end overflow-hidden rounded-[inherit] sm:min-h-80 lg:min-h-95',
      )}
    >
      <div aria-hidden className="absolute inset-0 -z-[21] bg-bg" style={{ backgroundColor: primary }} />
      {hasImage ? (
        <img
          src={heroImageUrl as string}
          alt=""
          aria-hidden
          className="absolute inset-0 -z-20 size-full object-cover"
          style={{ opacity: photoOpacity }}
        />
      ) : null}
      <div
        aria-hidden
        className="absolute inset-0 -z-10"
        style={{
          backgroundImage: `linear-gradient(115deg, ${primary}f2 0%, ${primary}9e 38%, ${primary}33 68%, rgba(0,0,0,0.15) 100%), linear-gradient(to top, rgba(0,0,0,0.72), rgba(0,0,0,0.15) 55%, transparent 80%)`,
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -right-16 -top-20 -z-10 size-72 rounded-full opacity-50 blur-3xl"
        style={{ backgroundColor: accent }}
      />
      <div className="relative w-full p-5 text-white sm:p-8 lg:p-10">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between sm:gap-6">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-3">
              <HeroLogo logoUrl={logoUrl} className="size-12 sm:size-14" glass />
              {tagline?.trim() ? <HeroTagline tagline={tagline.trim()} accent={accent} light /> : null}
            </div>
            <h1 className="mt-3 max-w-2xl font-display text-3xl font-bold leading-[1.05] tracking-tight drop-shadow-sm sm:mt-5 sm:text-4xl lg:text-5xl">
              {heading}
            </h1>
            {heroSubheading?.trim() ? (
              <p className="mt-2 max-w-xl text-sm leading-relaxed text-white/85 sm:mt-3 sm:text-base lg:text-lg">{heroSubheading}</p>
            ) : null}
          </div>
          {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2 sm:gap-3">{actions}</div> : null}
        </div>
      </div>
    </div>
    </div>
  )
}

export function TradingTableHero({ props, tokens }: { props: StoreHeroProps; tokens: Tokens }) {
  const { primary, accent } = tokens
  return (
    <HeroShell props={props} tokens={tokens} layout="trading-table" photoScrim="dark" minClass="min-h-[18rem] sm:min-h-[24rem]">
      <div
        aria-hidden
        className="absolute inset-0 -z-[5] opacity-90"
        style={{
          backgroundImage: `radial-gradient(ellipse at center, ${primary}44 0%, transparent 70%), linear-gradient(135deg, #1a1208 0%, #0f172a 100%)`,
        }}
      />
      <div className="relative flex min-h-[18rem] flex-col justify-between p-5 text-white sm:min-h-[24rem] sm:p-8">
        <div className="flex justify-between opacity-80">
          <Dices aria-hidden className="size-8 rotate-12" />
          <Box aria-hidden className="size-10 -rotate-6" />
          <Sparkles aria-hidden className="size-7 rotate-45" />
        </div>
        <div className="mx-auto max-w-lg rounded-2xl border border-white/15 bg-black/35 px-4 py-5 text-center backdrop-blur-md sm:px-6 sm:py-8">
          <HeroLogo logoUrl={props.logoUrl} className="mx-auto size-12" glass />
          <h1 className="mt-4 font-display text-2xl font-bold sm:text-3xl">{tokens.heading}</h1>
          {props.heroSubheading?.trim() ? <p className="mt-2 text-sm text-white/80">{props.heroSubheading}</p> : null}
          {props.actions ? <div className="mt-4 flex flex-wrap justify-center gap-2">{props.actions}</div> : null}
        </div>
        <p className="text-center text-xs uppercase tracking-[0.2em] text-white/50" style={{ color: accent }}>
          Premium playmat
        </p>
      </div>
    </HeroShell>
  )
}

export function EventBoardHero({ props, tokens }: { props: StoreHeroProps; tokens: Tokens }) {
  // No hero photo → solid primary fill. In light mode that primary is often
  // navy/black while --color-fg is near-black, so title/subcopy must flip to
  // white. With a photo + token scrim the field is page-colored — use normal fg.
  const lightCopy = !tokens.hasImage && isDarkHex(tokens.primary)

  return (
    <HeroShell
      props={props}
      tokens={tokens}
      layout="event-board"
      photoScrim={lightCopy ? 'dark' : 'token'}
      className="dark:border-white/12 dark:bg-surface/40 dark:shadow-[0_20px_50px_-12px_rgba(0,0,0,0.55)]"
    >
      <div className="grid gap-5 p-5 lg:grid-cols-2 lg:items-start lg:p-8">
        <IdentityHeader props={props} tokens={tokens} light={lightCopy} />
        <CommunityBoard events={props.communityEvents} compact slug={props.slug} className="lg:rotate-2" />
      </div>
    </HeroShell>
  )
}

export function FloatingCardsHero({ props, tokens }: { props: StoreHeroProps; tokens: Tokens }) {
  return (
    <HeroShell props={props} tokens={tokens} layout="floating-cards" photoScrim="dark" minClass="min-h-[18rem] sm:min-h-[26rem]">
      <FloatingCardsLayer cards={props.showcaseCards ?? []} count={20} />
      <div className="relative flex min-h-[18rem] flex-col justify-end p-5 text-white sm:min-h-[26rem] sm:p-10">
        <IdentityHeader props={props} tokens={tokens} light />
      </div>
    </HeroShell>
  )
}

export function LivingInventoryHero({ props, tokens }: { props: StoreHeroProps; tokens: Tokens }) {
  const cards = props.showcaseCards ?? []
  const loopTrack = (() => {
    const source = cards.length > 0 ? cards : GENERIC_MTG_CARDS
    let base = [...source]
    while (base.length < 12) {
      base = [...base, ...source]
    }
    return [...base, ...base]
  })()

  return (
    <HeroShell props={props} tokens={tokens} layout="living-inventory" minClass="min-h-[20rem]">
      <div className="overflow-hidden py-4">
        <div className="flex w-max gap-3 motion-safe:animate-[hero-scroll_28s_linear_infinite] motion-reduce:animate-none">
          {loopTrack.map((card, i) => (
            <HeroCardImg
              key={`${card.imageUrl}-${i}`}
              card={card}
              fallbackIndex={i + 5}
              className="aspect-[5/7] w-24 shrink-0"
            />
          ))}
        </div>
      </div>
      <div className={cx('m-4 rounded-card bg-surface/95 p-6', storeFrameClass('hero'))}>
        <IdentityHeader props={props} tokens={tokens} />
      </div>
    </HeroShell>
  )
}

const HERO_RENDERERS: Record<
  HeroLayout,
  (p: { props: StoreHeroProps; tokens: Tokens }) => React.ReactElement
> = {
  cinematic: CinematicHero,
  'trading-table': TradingTableHero,
  'event-board': EventBoardHero,
  'floating-cards': FloatingCardsHero,
  'living-inventory': LivingInventoryHero,
  // Aliases & legacy (normalizeHeroLayout should rewrite these before render)
  'floating-collection': FloatingCardsHero,
  'trading-desk': TradingTableHero,
  storefront: CinematicHero,
  'featured-card': CinematicHero,
  collection: LivingInventoryHero,
  'full-art': CinematicHero,
  mascot: CinematicHero,
  dynamic: CinematicHero,
  video: CinematicHero,
  minimal: CinematicHero,
  banner: CinematicHero,
  spotlight: CinematicHero,
  'store-story-hero': CinematicHero,
  'collectors-shelf': CinematicHero,
  'open-binder': CinematicHero,
  'store-counter': CinematicHero,
  'planeswalkers-desk': TradingTableHero,
  'shipping-station': LivingInventoryHero,
  'trophy-wall': CinematicHero,
  'convention-booth': CinematicHero,
  'library-shelf': LivingInventoryHero,
  'world-map': CinematicHero,
  'gallery-wall': CinematicHero,
  vault: CinematicHero,
  'command-center': CinematicHero,
  'guild-hall': CinematicHero,
  'mosaic-hero': LivingInventoryHero,
  'store-window': CinematicHero,
  'day-night-hero': CinematicHero,
}

export function SignatureHeroLayout({
  layout,
  props,
  tokens,
}: {
  layout: HeroLayout
  props: StoreHeroProps
  tokens: Tokens
}) {
  const Component = HERO_RENDERERS[layout] ?? CinematicHero
  return <Component props={props} tokens={tokens} />
}
