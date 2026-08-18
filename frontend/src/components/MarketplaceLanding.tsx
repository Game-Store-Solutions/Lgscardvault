import { Link } from 'react-router'
import { motion } from 'framer-motion'
import { ArrowRight, Mail, PackageSearch, ShieldCheck, Store, Wallet } from 'lucide-react'
import { BrandLogo } from './BrandLogo'
import { FloatingCardsBackdrop } from './FloatingCardsBackdrop'
import { useAuth } from '../context/AuthContext'
import { useCatalogGames } from '../hooks'
import { useAppShellFlush } from './layout/AppShellLayout'
import { EASE_PREMIUM, Reveal, Stagger, StaggerItem } from './motion'
import { gameTile } from '../lib/gameTiles'
import { contactEmails } from '../lib/runtimeEnv'

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
  const { data: games = [], isLoading: gamesLoading } = useCatalogGames()
  useAppShellFlush(true)

  const activeGames = games.filter((game) => game.active !== false)

  const primaryCta =
    'inline-flex h-12 w-full items-center justify-center gap-2 rounded-btn bg-brand-500 px-6 text-sm font-bold text-white shadow-sm transition-colors hover:bg-brand-600 sm:w-auto'
  const secondaryCta =
    'inline-flex h-12 w-full items-center justify-center gap-2 rounded-btn border border-border bg-surface px-6 text-sm font-bold text-fg shadow-sm transition-colors hover:bg-bg sm:w-auto dark:border-white/10 dark:bg-white/[0.04] dark:hover:bg-white/[0.08]'

  const contactHref = `mailto:${contactEmails.join(',')}?subject=${encodeURIComponent("Interested in LG's Card Vault")}&body=${encodeURIComponent("Hi,\n\nI'm interested in learning more about LG's Card Vault.\n\nName:\nStore / Team:\nWhat I'm looking for:\n\nThanks.")}`

  return (
    <div className="bg-bg">
      <section className="relative isolate min-h-[calc(100dvh-3.75rem)] overflow-hidden">
        <div
          aria-hidden
          className="absolute inset-0 bg-[radial-gradient(ellipse_80%_60%_at_50%_-10%,rgba(198,160,53,0.12),transparent_55%),linear-gradient(165deg,#fafafa_0%,#f3f4f6_48%,#e5e7eb_100%)] dark:bg-[radial-gradient(ellipse_78%_55%_at_50%_-6%,rgba(220,38,38,0.18),transparent_56%),linear-gradient(180deg,#09090b_0%,#121214_54%,#09090b_100%)]"
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
            Discover, collect, and trade the cards you care about through trusted local game stores and a
            collector-first marketplace.
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
      </section>

      <div className="mx-auto flex max-w-7xl flex-col gap-16 px-4 pb-20 pt-14 sm:gap-20 sm:px-6 sm:pt-16 lg:px-8">
        {/* Supported games — driven by the platform's own catalog. */}
        <section id="games" className="scroll-mt-24">
          <Reveal className="space-y-2">
            <p className="text-eyebrow">Games we support</p>
            <h2 className="mt-2 text-display-sm sm:text-display-md">
              Every game our stores stock.
            </h2>
            <p className="max-w-2xl text-sm leading-7 text-fg-muted">
              Singles and sealed product across the games collectors actually play, all searchable by set, rarity,
              condition, and finish.
            </p>
          </Reveal>

          {gamesLoading ? (
            <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
              {Array.from({ length: 5 }).map((_, index) => (
                <div
                  key={index}
                  className="aspect-[3/4] rounded-card border border-border skeleton-shimmer dark:border-white/10"
                />
              ))}
            </div>
          ) : (
            <Stagger className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5" gap={0.05}>
              {activeGames.map((game) => {
                const tile = gameTile(game.code, game.name)
                return (
                  <StaggerItem key={game.id ?? game.code} className="h-full">
                    {/* Presentational only — these show coverage, not navigation. */}
                    <figure className="relative flex aspect-[3/4] flex-col justify-end overflow-hidden rounded-card border border-border bg-surface shadow-card dark:border-white/10 dark:bg-white/[0.03]">
                      {tile.art ? (
                        <>
                          <img
                            src={tile.art}
                            alt=""
                            aria-hidden
                            loading="lazy"
                            decoding="async"
                            className="absolute inset-0 size-full object-cover"
                          />
                          <div
                            aria-hidden
                            className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/45 to-black/10"
                          />
                        </>
                      ) : (
                        // No verified art for this game yet — lean on the accent.
                        <div
                          aria-hidden
                          className="absolute inset-0"
                          style={{
                            background: `radial-gradient(115% 85% at 20% 0%, ${tile.accent}59 0%, transparent 68%), linear-gradient(180deg, ${tile.accent}1f 0%, rgba(0,0,0,0.55) 100%)`,
                          }}
                        />
                      )}
                      <span
                        aria-hidden
                        className="absolute inset-x-0 top-0 h-1"
                        style={{ backgroundColor: tile.accent }}
                      />
                      <figcaption
                        className={
                          tile.art
                            ? 'relative p-3.5'
                            : 'relative flex flex-1 flex-col justify-between p-3.5'
                        }
                      >
                        {!tile.art && (
                          <span
                            aria-hidden
                            className="font-display text-3xl font-black leading-none tracking-[-0.06em] sm:text-4xl"
                            style={{ color: tile.accent }}
                          >
                            {tile.short.slice(0, 2).toUpperCase()}
                          </span>
                        )}
                        <span className="block">
                          <span className="block font-display text-base font-extrabold leading-tight tracking-[-0.03em] text-white sm:text-lg">
                            {tile.short}
                          </span>
                          <span className="mt-1 block text-eyebrow !text-white/60">{game.name}</span>
                        </span>
                      </figcaption>
                    </figure>
                  </StaggerItem>
                )
              })}
            </Stagger>
          )}
        </section>

        {/* Why the marketplace. */}
        <section className="scroll-mt-24">
          <Reveal className="space-y-2">
            <p className="text-eyebrow">Why LG’s Card Vault</p>
            <h2 className="mt-2 text-display-sm sm:text-display-md">
              Built for collectors and the stores they trust.
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
          <div className="grid gap-6 p-6 sm:p-8 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] lg:items-center">
            <div>
              <p className="text-eyebrow">Contact us</p>
              <h2 className="mt-2.5 text-display-sm sm:text-display-md">
                Questions about a plan or opening a store?
              </h2>
              <p className="mt-3 max-w-2xl text-sm leading-7 text-fg-muted">
                Send us a note and we’ll follow up about pricing, onboarding, and getting your inventory live.
              </p>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row lg:justify-end">
              <a href={contactHref} className={primaryCta}>
                <Mail aria-hidden className="size-4" />
                Email the team
              </a>
            </div>
          </div>
        </Reveal>
      </div>
    </div>
  )
}
