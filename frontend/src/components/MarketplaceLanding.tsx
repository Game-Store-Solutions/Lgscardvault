import { Link } from 'react-router'
import { motion } from 'framer-motion'
import { ArrowRight, BadgeCheck, CalendarDays, Mail, MapPin, PackageSearch, ShieldCheck, Store, Wallet } from 'lucide-react'
import { BrandLogo } from './BrandLogo'
import { FloatingCardsBackdrop } from './FloatingCardsBackdrop'
import { useAuth } from '../context/AuthContext'
import { useActiveStores } from '../hooks'
import { useAppShellFlush } from './layout/AppShellLayout'
import { StoreCard, StoreCardSkeleton } from './store'
import { EASE_PREMIUM, Reveal, Stagger, StaggerItem } from './motion'
import { memberSince, storeAccent } from '../lib/storeAccent'

const PLATFORM_ADMIN_EMAILS = ['primary-admin@test.local', 'secondary-admin@test.local']

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
  const { data: stores = [], isLoading } = useActiveStores()
  const featuredStore = stores.find((store) => store.featured) ?? stores[0]
  // The featured store already gets a full panel, so keep it out of the grid
  // below instead of showing the same storefront twice.
  const otherStores = stores.filter((store) => store.id !== featuredStore?.id)
  useAppShellFlush(true)

  const primaryCta =
    'inline-flex h-12 w-full items-center justify-center gap-2 rounded-btn bg-brand-500 px-6 text-sm font-bold text-white shadow-sm transition-colors hover:bg-brand-600 sm:w-auto'
  const secondaryCta =
    'inline-flex h-12 w-full items-center justify-center gap-2 rounded-btn border border-border bg-surface px-6 text-sm font-bold text-fg shadow-sm transition-colors hover:bg-bg sm:w-auto dark:border-white/10 dark:bg-white/[0.04] dark:hover:bg-white/[0.08]'

  const reachOutHref = `mailto:${PLATFORM_ADMIN_EMAILS.join(',')}?subject=${encodeURIComponent("Interested in LG's Card Vault")}&body=${encodeURIComponent("Hi,\n\nI'm interested in learning more about LG's Card Vault.\n\nName:\nStore / Team:\nWhat I'm looking for:\n\nThanks.")}`

  const featuredAccent = storeAccent(0, featuredStore?.primaryColor)
  const featuredLocation = [featuredStore?.city, featuredStore?.region].filter(Boolean).join(', ')
  const featuredSince = memberSince(featuredStore?.createdAt)

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
            className="mt-8 max-w-3xl font-display text-[2.15rem] font-bold uppercase leading-[1.02] tracking-[-0.06em] text-fg sm:mt-10 sm:text-6xl sm:leading-[0.96]"
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
        {/* Featured store — one panel, no duplicate card beside it. */}
        {featuredStore && (
          <section id="featured-store" className="scroll-mt-24">
            <Reveal className="space-y-2">
              <p className="text-xs font-bold uppercase tracking-[0.24em] text-fg-muted">Featured store</p>
              <h2 className="font-display text-2xl font-bold tracking-tight text-fg sm:text-4xl">
                Start with the storefront we’re spotlighting.
              </h2>
            </Reveal>

            <Reveal
              delay={0.06}
              className="mt-6 overflow-hidden rounded-card border border-border bg-surface shadow-card dark:border-white/10 dark:bg-white/[0.03]"
            >
              <span aria-hidden className="block h-1 w-full" style={{ backgroundColor: featuredAccent }} />
              <div className="grid gap-8 p-5 sm:p-8 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)] lg:items-center">
                <div>
                  <div className="flex items-center gap-3">
                    <span
                      className="grid size-12 shrink-0 place-items-center overflow-hidden rounded-xl border border-border bg-bg font-display text-sm font-black dark:border-white/10 dark:bg-white/[0.04]"
                      style={{ color: featuredAccent }}
                    >
                      {featuredStore.logoUrl?.trim() ? (
                        <img src={featuredStore.logoUrl} alt="" className="size-full object-cover" />
                      ) : (
                        featuredStore.name.trim().slice(0, 2).toUpperCase()
                      )}
                    </span>
                    <div className="min-w-0">
                      <h3 className="truncate font-display text-xl font-bold tracking-tight text-fg sm:text-2xl">
                        {featuredStore.name}
                      </h3>
                      <p className="truncate text-sm text-fg-muted">/{featuredStore.slug}</p>
                    </div>
                  </div>

                  <p className="mt-4 max-w-2xl text-sm leading-7 text-fg-muted">
                    {featuredStore.heroSubheading?.trim() ||
                      featuredStore.tagline?.trim() ||
                      'Browse singles, compare inventory, and shop with confidence.'}
                  </p>

                  <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-fg-muted">
                    <span className="inline-flex items-center gap-1.5 font-medium text-success-700">
                      <BadgeCheck aria-hidden className="size-4" />
                      Verified store
                    </span>
                    {featuredLocation && (
                      <span className="inline-flex items-center gap-1.5">
                        <MapPin aria-hidden className="size-3.5" />
                        {featuredLocation}
                      </span>
                    )}
                    {featuredSince && (
                      <span className="inline-flex items-center gap-1.5">
                        <CalendarDays aria-hidden className="size-3.5" />
                        Since {featuredSince}
                      </span>
                    )}
                  </div>

                  <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
                    <Link to={`/s/${featuredStore.slug}`} className={primaryCta}>
                      Visit store
                      <ArrowRight aria-hidden className="size-4" />
                    </Link>
                    <Link to="/stores" className={secondaryCta}>
                      Browse all stores
                    </Link>
                  </div>
                </div>

                {/* Direct entry points instead of repeating the store card. */}
                <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-1">
                  {[
                    { label: 'Singles', to: `/s/${featuredStore.slug}` },
                    { label: 'Sealed product', to: `/s/${featuredStore.slug}/sealed` },
                    { label: 'Events', to: `/s/${featuredStore.slug}/events` },
                    { label: 'Sell or trade', to: `/s/${featuredStore.slug}/sell` },
                  ].map((shortcut) => (
                    <Link
                      key={shortcut.label}
                      to={shortcut.to}
                      className="group flex items-center justify-between gap-3 rounded-btn border border-border bg-bg px-4 py-3 text-sm font-bold text-fg transition-colors hover:border-fg/15 dark:border-white/10 dark:bg-white/[0.04] dark:hover:border-white/20"
                    >
                      {shortcut.label}
                      <ArrowRight
                        aria-hidden
                        className="size-4 text-fg-muted transition-transform duration-300 group-hover:translate-x-1"
                      />
                    </Link>
                  ))}
                </div>
              </div>
            </Reveal>
          </section>
        )}

        {/* Why the marketplace — substance rather than a repeated store list. */}
        <section className="scroll-mt-24">
          <Reveal className="space-y-2">
            <p className="text-xs font-bold uppercase tracking-[0.24em] text-fg-muted">Why LG’s Card Vault</p>
            <h2 className="font-display text-2xl font-bold tracking-tight text-fg sm:text-4xl">
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

        {/* Remaining storefronts. Hidden when the featured store is the only one. */}
        {(isLoading || otherStores.length > 0) && (
          <section id="marketplace" className="scroll-mt-24">
            <Reveal className="space-y-2">
              <p className="text-xs font-bold uppercase tracking-[0.24em] text-fg-muted">Marketplace</p>
              <h2 className="font-display text-2xl font-bold tracking-tight text-fg sm:text-4xl">
                More local game stores.
              </h2>
            </Reveal>

            {isLoading ? (
              <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                {Array.from({ length: 3 }).map((_, index) => (
                  <StoreCardSkeleton key={index} />
                ))}
              </div>
            ) : (
              <Stagger className="mt-6 grid items-stretch gap-5 sm:grid-cols-2 lg:grid-cols-3">
                {otherStores.slice(0, 6).map((store, index) => (
                  <StaggerItem key={store.id} className="h-full">
                    <StoreCard store={store} index={index + 1} />
                  </StaggerItem>
                ))}
              </Stagger>
            )}

            {otherStores.length > 6 && (
              <div className="mt-8 flex justify-center">
                <Link to="/stores" className={secondaryCta}>
                  Browse all stores
                </Link>
              </div>
            )}
          </section>
        )}

        <Reveal
          id="reach-out"
          className="scroll-mt-24 overflow-hidden rounded-card border border-border bg-surface shadow-card dark:border-white/10 dark:bg-white/[0.03]"
        >
          <div className="grid gap-6 p-6 sm:p-8 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] lg:items-center">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.24em] text-fg-muted">Reach out</p>
              <h2 className="mt-3 font-display text-2xl font-bold tracking-tight text-fg sm:text-3xl">
                Interested in opening a store or learning more?
              </h2>
              <p className="mt-3 max-w-2xl text-sm leading-7 text-fg-muted">
                Send us a note and we’ll follow up about the platform, onboarding, and what you want to build.
              </p>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row lg:justify-end">
              <a href={reachOutHref} className={primaryCta}>
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
