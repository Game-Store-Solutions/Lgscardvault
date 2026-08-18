import { Link } from 'react-router'
import { motion } from 'framer-motion'
import { ArrowRight, Mail, Store } from 'lucide-react'
import { BrandLogo } from './BrandLogo'
import { FloatingCardsBackdrop } from './FloatingCardsBackdrop'
import { useAuth } from '../context/AuthContext'
import { useActiveStores } from '../hooks'
import { useAppShellFlush } from './layout/AppShellLayout'
import { StoreCard, StoreCardSkeleton } from './store'
import { EASE_PREMIUM, Reveal, Stagger, StaggerItem } from './motion'

const PLATFORM_ADMIN_EMAILS = ['primary-admin@test.local', 'secondary-admin@test.local']

export default function MarketplaceLanding() {
  const { isSuperAdmin } = useAuth()
  const { data: stores = [], isLoading } = useActiveStores()
  const hasStores = stores.length > 0
  const featuredStore = stores.find((store) => store.featured) ?? stores[0]
  useAppShellFlush(true)

  const primaryCta =
    'inline-flex h-12 w-full items-center justify-center gap-2 rounded-btn bg-brand-500 px-6 text-sm font-bold text-white shadow-sm transition-colors hover:bg-brand-600 sm:w-auto'
  const secondaryCta =
    'inline-flex h-12 w-full items-center justify-center gap-2 rounded-btn border border-border bg-surface px-6 text-sm font-bold text-fg shadow-sm transition-colors hover:bg-bg sm:w-auto dark:border-white/10 dark:bg-white/[0.04] dark:hover:bg-white/[0.08]'

  const reachOutHref = `mailto:${PLATFORM_ADMIN_EMAILS.join(',')}?subject=${encodeURIComponent("Interested in LG's Card Vault")}&body=${encodeURIComponent("Hi,\n\nI'm interested in learning more about LG's Card Vault.\n\nName:\nStore / Team:\nWhat I'm looking for:\n\nThanks.")}`

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
          className="opacity-90"
          washClassName="bg-[radial-gradient(ellipse_52%_38%_at_50%_48%,rgba(243,244,246,0.86),transparent_72%)] dark:bg-[radial-gradient(ellipse_48%_34%_at_50%_48%,rgba(9,9,11,0.9),transparent_72%)]"
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
            className="mt-8 flex w-full max-w-sm flex-col items-stretch gap-3 sm:mt-9 sm:max-w-none sm:flex-row sm:flex-wrap sm:items-center sm:justify-center"
          >
            {hasStores && (
              <a href="#featured-store" className={primaryCta}>
                Featured store
                <ArrowRight aria-hidden className="size-4" />
              </a>
            )}
            <Link to="/stores" className={secondaryCta}>
              Explore stores
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

      <div className="mx-auto flex max-w-7xl flex-col gap-14 px-4 pb-20 sm:gap-16 sm:px-6 lg:px-8">
        {featuredStore && (
          <section id="featured-store" className="scroll-mt-24 space-y-5">
            <Reveal className="space-y-2">
              <p className="text-xs font-bold uppercase tracking-[0.24em] text-fg-muted">Featured store</p>
              <h2 className="font-display text-2xl font-bold tracking-tight text-fg sm:text-4xl">
                Start with the storefront we’re spotlighting.
              </h2>
            </Reveal>
            <div className="grid gap-5 lg:grid-cols-[minmax(0,1.1fr)_minmax(18rem,0.9fr)]">
              <Reveal
                delay={0.05}
                className="rounded-card border border-border bg-surface p-5 shadow-card sm:p-6 dark:border-white/10 dark:glass-card"
              >
                <p className="text-xs uppercase tracking-[0.2em] text-fg-muted">Now featuring</p>
                <h3 className="mt-3 font-display text-xl font-bold text-fg sm:text-2xl">{featuredStore.name}</h3>
                <p className="mt-3 max-w-2xl text-sm leading-7 text-fg-muted">
                  {featuredStore.heroSubheading?.trim() ||
                    featuredStore.tagline?.trim() ||
                    'Browse singles, compare inventory, and shop with confidence.'}
                </p>
                <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
                  <Link to={`/s/${featuredStore.slug}`} className={primaryCta}>
                    Visit store
                    <ArrowRight aria-hidden className="size-4" />
                  </Link>
                  <Link to="/stores" className={secondaryCta}>
                    Browse all stores
                  </Link>
                </div>
              </Reveal>
              <Reveal delay={0.12}>
                <StoreCard store={featuredStore} />
              </Reveal>
            </div>
          </section>
        )}

        <section id="marketplace" className="scroll-mt-24 space-y-5">
          <Reveal className="space-y-2">
            <p className="text-xs font-bold uppercase tracking-[0.24em] text-fg-muted">Marketplace</p>
            <h2 className="font-display text-2xl font-bold tracking-tight text-fg sm:text-4xl">
              Trusted local game stores.
            </h2>
          </Reveal>

          {isLoading ? (
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {Array.from({ length: 3 }).map((_, index) => (
                <StoreCardSkeleton key={index} />
              ))}
            </div>
          ) : (
            <Stagger className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {stores.slice(0, 6).map((store, index) => (
                <StaggerItem key={store.id} className="h-full">
                  <StoreCard store={store} index={index} />
                </StaggerItem>
              ))}
            </Stagger>
          )}

          {stores.length > 6 && (
            <div className="flex justify-center">
              <Link to="/stores" className={secondaryCta}>
                Browse all stores
              </Link>
            </div>
          )}
        </section>

        <Reveal
          id="reach-out"
          className="scroll-mt-24 rounded-card border border-border bg-surface p-6 shadow-card sm:p-8 dark:border-white/10 dark:glass-card"
        >
          <p className="text-xs font-bold uppercase tracking-[0.24em] text-fg-muted">Reach out</p>
          <h2 className="mt-3 max-w-2xl font-display text-2xl font-bold tracking-tight text-fg sm:text-4xl">
            Interested in opening a store or learning more?
          </h2>
          <p className="mt-3 max-w-2xl text-sm leading-7 text-fg-muted">
            Send us a quick note and we’ll follow up about the platform, onboarding, and what you want to build.
          </p>
          <div className="mt-6">
            <a href={reachOutHref} className={primaryCta}>
              <Mail aria-hidden className="size-4" />
              Email the platform team
            </a>
          </div>
        </Reveal>
      </div>
    </div>
  )
}
