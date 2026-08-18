import { Link } from 'react-router'
import { useEffect } from 'react'
import { motion } from 'framer-motion'
import { ArrowRight, PackageSearch, ShieldCheck, Store, Wallet } from 'lucide-react'
import { BrandLogo } from './BrandLogo'
import { FloatingCardsBackdrop } from './FloatingCardsBackdrop'
import { useAuth } from '../context/AuthContext'
import { useGameShowcase, useShowcaseCards } from '../hooks'
import { useAppShellFlush } from './layout/AppShellLayout'
import { EASE_PREMIUM, Reveal, Stagger, StaggerItem } from './motion'
import { ContactForm } from './ContactForm'
import { GameShowcaseReel, warmupShowcaseCards } from './GameShowcaseReel'
import { GameTile } from './GameTile'

const TRUST_POINTS = [
  {
    icon: ShieldCheck,
    title: 'Verified storefronts',
    text: 'Every store is reviewed and approved before it can list inventory.',
  },
  {
    icon: PackageSearch,
    title: 'Real store inventory',
    text: 'Browse singles and sealed product that stores actually have on the shelf.',
  },
  {
    icon: Wallet,
    title: 'Buy, sell, and trade',
    text: 'Check out online or in store, and send your collection in for cash or credit.',
  },
]

export default function MarketplaceLanding() {
  const { isSuperAdmin } = useAuth()
  const { data: games = [], isLoading: gamesLoading } = useGameShowcase()
  // Each game's signature cards behind the hero, resolved from our catalog.
  // 12 per game fills the 60 layout slots when all five games are stocked.
  const { data: showcaseCards = [], isPending: cardsPending } = useShowcaseCards(12)
  const backdropImages = showcaseCards
    .map((card) => card.imageUrl)
    .filter((url): url is string => Boolean(url))
  useAppShellFlush(true)

  useEffect(() => {
    if (showcaseCards.length === 0) return
    warmupShowcaseCards(showcaseCards)
  }, [showcaseCards])

  const primaryCta =
    'inline-flex h-12 w-full items-center justify-center gap-2 rounded-btn bg-brand-500 px-6 text-sm font-bold text-white shadow-sm transition-colors hover:bg-brand-600 sm:w-auto'
  const secondaryCta =
    'inline-flex h-12 w-full items-center justify-center gap-2 rounded-btn border border-border bg-surface px-6 text-sm font-bold text-fg shadow-sm transition-colors hover:bg-bg sm:w-auto dark:border-white/10 dark:bg-white/[0.04] dark:hover:bg-white/[0.08]'

  return (
    <div className="bg-bg">
      <section className="relative isolate min-h-[calc(100dvh-3.75rem)] overflow-hidden">
        <div
          aria-hidden
          className="absolute inset-0 bg-[radial-gradient(ellipse_80%_60%_at_50%_-10%,rgba(198,160,53,0.12),transparent_55%),linear-gradient(180deg,#fafafa_0%,#f3f4f6_46%,transparent_100%)] dark:bg-[radial-gradient(ellipse_78%_55%_at_50%_-6%,rgba(220,38,38,0.18),transparent_56%),linear-gradient(180deg,#09090b_0%,#121214_48%,transparent_100%)]"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-[0.22] dark:opacity-[0.16]"
          style={{
            backgroundImage:
              'linear-gradient(rgba(255,255,255,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px)',
            backgroundSize: '36px 36px',
            maskImage: 'radial-gradient(ellipse at center, black 18%, transparent 72%)',
          }}
        />
        <FloatingCardsBackdrop
          layout="scatter"
          images={backdropImages}
          className="[mask-image:linear-gradient(to_bottom,black_0%,black_70%,transparent_92%)] [-webkit-mask-image:linear-gradient(to_bottom,black_0%,black_70%,transparent_92%)]"
          washClassName="bg-[radial-gradient(ellipse_40%_30%_at_50%_46%,rgba(243,244,246,0.92),rgba(243,244,246,0.55)_58%,transparent_76%)] dark:bg-[radial-gradient(ellipse_40%_30%_at_50%_46%,rgba(9,9,11,0.94),rgba(9,9,11,0.6)_58%,transparent_78%)]"
        />

        <div className="relative z-10 mx-auto flex min-h-[calc(100dvh-3.75rem)] max-w-4xl flex-col items-center justify-center px-5 pb-16 pt-10 text-center sm:px-10">
          <motion.div
            initial={{ opacity: 0, scale: 0.94 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.7, ease: EASE_PREMIUM }}
          >
            <BrandLogo size="hero" variant="auto" to={null} className="drop-shadow-[0_14px_44px_rgba(0,0,0,0.32)]" />
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: EASE_PREMIUM, delay: 0.12 }}
            className="mt-8 max-w-3xl text-display-lg uppercase sm:mt-10 sm:text-display-xl"
          >
            Build your vault.
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: EASE_PREMIUM, delay: 0.22 }}
            className="mt-4 max-w-2xl text-[0.95rem] leading-relaxed text-fg-muted sm:mt-5 sm:text-lg"
          >
            Discover, play, and trade the cards you care about through trusted local game stores and a
            player-first marketplace.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: EASE_PREMIUM, delay: 0.32 }}
            className="mt-8 flex w-full max-w-sm flex-col items-stretch gap-3 sm:mt-10 sm:max-w-none sm:flex-row sm:flex-wrap sm:items-center sm:justify-center"
          >
            <Link to="/stores" className={primaryCta}>
              Explore stores
              <ArrowRight aria-hidden className="size-4" />
            </Link>
            {isSuperAdmin ? (
              <Link to="/platform/admin" className={secondaryCta}>
                <Store aria-hidden className="size-4" />
                Platform admin
              </Link>
            ) : (
              <Link to="/register/owner" className={secondaryCta}>
                <Store aria-hidden className="size-4" />
                Open a store
              </Link>
            )}
          </motion.div>
        </div>

        {/* Fade the field out before the next section so cards never bleed through. */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 bottom-0 z-[15] h-28 bg-gradient-to-b from-transparent to-bg sm:h-36"
        />
      </section>

      <div className="relative z-10 mx-auto flex max-w-7xl flex-col gap-16 bg-bg px-4 pb-20 pt-12 sm:gap-20 sm:px-6 sm:pt-16 lg:px-8">
        {/* Supported games — driven by the platform's own catalog. */}
        <section id="games" className="relative scroll-mt-24 overflow-visible">
          <Reveal>
            <p className="text-eyebrow">Games we support</p>
          </Reveal>

          {gamesLoading || cardsPending ? (
            <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
              {Array.from({ length: 4 }).map((_, index) => (
                <div
                  key={index}
                  className="aspect-[3/4] rounded-card border border-border skeleton-shimmer dark:border-white/10"
                />
              ))}
            </div>
          ) : showcaseCards.length > 0 ? (
            <GameShowcaseReel games={games} cards={showcaseCards} />
          ) : (
            <>
              <h2 className="mt-2 text-display-sm sm:text-display-md">Every game our stores stock.</h2>
              <p className="mt-3 max-w-2xl text-sm leading-7 text-fg-muted">
                Singles and sealed product across the games players actually play, all searchable by set, rarity,
                condition, and finish.
              </p>
              <Stagger className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5" gap={0.05}>
                {games.map((game) => (
                  <StaggerItem key={game.code} className="h-full">
                    <GameTile game={game} />
                  </StaggerItem>
                ))}
              </Stagger>
            </>
          )}
        </section>

        {/* Why the marketplace. */}
        <section className="scroll-mt-24">
          <Reveal className="space-y-2">
            <p className="text-eyebrow">Why LGS Card Vault</p>
            <h2 className="mt-2 text-display-sm sm:text-display-md">
              Built for players and the stores they trust.
            </h2>
          </Reveal>
          <Stagger className="mt-6 grid gap-4 md:grid-cols-3" gap={0.06}>
            {TRUST_POINTS.map(({ icon: Icon, title, text }) => (
              <StaggerItem key={title} className="h-full">
                <div className="h-full rounded-card border border-border bg-surface p-5 shadow-card dark:border-white/10 dark:bg-white/[0.03]">
                  <span className="inline-flex size-11 items-center justify-center rounded-btn border border-brand-500/20 bg-brand-500/10 text-brand-600 dark:text-brand-300">
                    <Icon aria-hidden className="size-5" />
                  </span>
                  <h3 className="mt-4 font-display text-lg font-bold tracking-tight text-fg">{title}</h3>
                  <p className="mt-2 text-sm leading-6 text-fg-muted">{text}</p>
                </div>
              </StaggerItem>
            ))}
          </Stagger>
        </section>

        {/* Contact us. */}
        <Reveal
          id="contact"
          className="scroll-mt-24 overflow-hidden rounded-card border border-border bg-surface shadow-card dark:border-white/10 dark:bg-white/[0.03]"
        >
          <div className="grid gap-8 p-6 sm:p-8 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
            <div>
              <p className="text-eyebrow">Contact us</p>
              <h2 className="mt-2.5 text-display-sm sm:text-display-md">
                Questions about opening a store?
              </h2>
              <p className="mt-3 max-w-xl text-sm leading-7 text-fg-muted">
                Send us a note and we’ll follow up about onboarding, pricing, and getting your inventory live.
              </p>
            </div>
            <ContactForm />
          </div>
        </Reveal>
      </div>
    </div>
  )
}
