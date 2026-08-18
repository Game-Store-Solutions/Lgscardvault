import { Link } from 'react-router'
import { ArrowRight, Mail, Store } from 'lucide-react'
import { BrandLogo } from './BrandLogo'
import { FloatingCardsBackdrop } from './FloatingCardsBackdrop'
import { useAuth } from '../context/AuthContext'
import { useActiveStores } from '../hooks'
import { useAppShellFlush } from './layout/AppShellLayout'
import { StoreCard } from './store'

const PLATFORM_ADMIN_EMAILS = ['primary-admin@test.local', 'secondary-admin@test.local']

export default function MarketplaceLanding() {
  const { isSuperAdmin } = useAuth()
  const { data: stores = [], isSuccess } = useActiveStores()
  const hasStores = isSuccess && stores.length > 0
  const featuredStore = stores.find((store) => store.featured) ?? stores[0]
  useAppShellFlush(true)

  const primaryCta =
    'inline-flex h-12 items-center justify-center gap-2 rounded-btn bg-brand-500 px-6 text-sm font-bold text-white shadow-sm transition-colors hover:bg-brand-600'
  const secondaryCta =
    'inline-flex h-12 items-center justify-center gap-2 rounded-btn border border-white/10 bg-white/[0.04] px-6 text-sm font-bold text-fg shadow-sm transition-colors hover:bg-white/[0.08]'

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
          washClassName="bg-[radial-gradient(ellipse_44%_32%_at_50%_48%,rgba(9,9,11,0.08),transparent_70%)] dark:bg-[radial-gradient(ellipse_44%_32%_at_50%_48%,rgba(9,9,11,0.88),transparent_72%)]"
        />

        <div className="relative z-10 mx-auto flex min-h-[calc(100dvh-3.75rem)] max-w-4xl flex-col items-center justify-center px-6 pb-16 pt-10 text-center sm:px-10">
          <BrandLogo size="hero" variant="auto" to={null} className="drop-shadow-[0_14px_44px_rgba(0,0,0,0.32)]" />

          <h1 className="mt-10 max-w-3xl font-display text-4xl font-bold uppercase tracking-[-0.08em] text-fg sm:text-6xl sm:leading-[0.96]">
            Build your vault.
          </h1>
          <p className="mt-5 max-w-2xl text-base leading-relaxed text-fg-muted sm:text-lg">
            Discover, collect, and trade the cards you care about through trusted local game stores and a collector-first marketplace.
          </p>

          <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
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
          </div>
        </div>
      </section>

      <div className="mx-auto flex max-w-7xl flex-col gap-12 px-4 pb-20 sm:px-6 lg:px-8">
        {featuredStore && (
          <section id="featured-store" className="scroll-mt-24 space-y-5">
            <div className="space-y-2">
              <p className="text-xs font-bold uppercase tracking-[0.24em] text-fg-muted">Featured store</p>
              <h2 className="font-display text-3xl font-bold tracking-tight text-fg sm:text-4xl">Start with the storefront we’re spotlighting.</h2>
            </div>
            <div className="grid gap-5 lg:grid-cols-[minmax(0,1.1fr)_minmax(18rem,0.9fr)]">
              <div className="rounded-card border border-border bg-surface p-6 shadow-card dark:glass-card">
                <p className="text-sm uppercase tracking-[0.2em] text-fg-muted">Now featuring</p>
                <h3 className="mt-3 text-2xl font-bold text-fg">{featuredStore.name}</h3>
                <p className="mt-3 max-w-2xl text-sm leading-7 text-fg-muted">
                  {featuredStore.heroSubheading?.trim() || featuredStore.tagline?.trim() || 'Browse singles, compare inventory, and shop with confidence.'}
                </p>
                <div className="mt-6 flex flex-wrap gap-3">
                  <Link to={`/s/${featuredStore.slug}`} className={primaryCta}>
                    Visit store
                    <ArrowRight aria-hidden className="size-4" />
                  </Link>
                  <Link to="/stores" className={secondaryCta}>
                    Browse all stores
                  </Link>
                </div>
              </div>
              <StoreCard store={featuredStore} />
            </div>
          </section>
        )}

        <section className="space-y-5">
          <div className="space-y-2">
            <p className="text-xs font-bold uppercase tracking-[0.24em] text-fg-muted">Marketplace</p>
            <h2 className="font-display text-3xl font-bold tracking-tight text-fg sm:text-4xl">Trusted local game stores.</h2>
          </div>
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {stores.slice(0, 6).map((store, index) => (
              <StoreCard key={store.id} store={store} index={index} />
            ))}
          </div>
          {stores.length > 6 && (
            <div className="flex justify-center">
              <Link to="/stores" className={secondaryCta}>
                Browse all stores
              </Link>
            </div>
          )}
        </section>

        <section className="rounded-card border border-border bg-surface p-8 shadow-card dark:glass-card">
          <p className="text-xs font-bold uppercase tracking-[0.24em] text-fg-muted">Reach out</p>
          <h2 className="mt-3 max-w-2xl font-display text-3xl font-bold tracking-tight text-fg sm:text-4xl">
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
        </section>
      </div>
    </div>
  )
}
