import { Link } from 'react-router'
import {
  ArrowLeftRight,
  ArrowRight,
  Bell,
  Layers,
  MapPin,
  Monitor,
  PackageSearch,
  Store,
} from 'lucide-react'
import { ContactForm } from '../components/ContactForm'
import { StorePlanCards } from '../components/marketing/StorePlanCards'
import { AdminProductShots } from '../components/marketing/StoreProductPreviews'
import { useAppShellFlush } from '../components/layout/AppShellLayout'
import { EASE_PREMIUM, Reveal, Stagger, StaggerItem, motion } from '../components/motion'
import { buttonVariants } from '../components/ui'
import { useOnboardingDraft } from '../hooks'
import { usePageMeta, useJsonLd } from '../hooks/usePageMeta'
import { usePreservedHref } from '../hooks/usePreservedHref'
import { cx } from '../lib/cx'
import { usePublicPlans } from '../lib/plans'
import { isOnboardingDraftInProgress } from './onboarding/draftStorage'

const BENEFITS = [
  {
    icon: Store,
    title: 'A storefront that looks like your shop',
    text: 'Your name, logo, and colors. Players browse your singles and sealed, not a generic marketplace grid.',
  },
  {
    icon: PackageSearch,
    title: 'Inventory that matches the shelf',
    text: 'CSV import or hand edits. Quantity, condition, and finish stay in sync so listings are cards you actually have.',
  },
  {
    icon: MapPin,
    title: 'Pickup checkout, you keep the sale',
    text: 'Square or pay-in-store. You are the merchant of record. No shipping. They pick up at your counter.',
  },
  {
    icon: ArrowLeftRight,
    title: 'Buylist without a second system',
    text: 'Players submit sell and trade lists. You review, offer cash or store credit, and keep the relationship in-house.',
  },
  {
    icon: Bell,
    title: 'Want lists and set restock alerts',
    text: 'Players watch cards and sets at your store. When stock comes back in, they get one notice, and you get the visit.',
  },
  {
    icon: Monitor,
    title: 'Deck builder, mass search, and kiosk',
    text: 'Commander recommendations on your storefront, paste-a-list search, and a locked customer terminal for the counter.',
  },
] as const

const STEPS = [
  {
    n: '01',
    title: 'Apply',
    text: 'Create the owner account, brand the shop, pick a plan, and submit licenses for review.',
  },
  {
    n: '02',
    title: 'Get approved',
    text: 'Every storefront is reviewed before it can list inventory. Verified shops only.',
  },
  {
    n: '03',
    title: 'Stock the site',
    text: 'Import a CSV or add cards by hand. Singles and sealed go live on your URL.',
  },
  {
    n: '04',
    title: 'Sell at the counter',
    text: 'Players pay online or in store, then pick up. You fulfill what you already do in person.',
  },
] as const

export default function ForStoresPage() {
  useAppShellFlush(true)
  const applyHref = usePreservedHref('/register/owner')
  const continueApplication = isOnboardingDraftInProgress(useOnboardingDraft())
  const applyLabel = continueApplication ? 'Continue application' : 'Apply to open a store'
  const { data: plans = [], isPending: plansPending } = usePublicPlans()

  usePageMeta({
    title: 'For Local Game Stores',
    description:
      'Put your cases online and keep the sale at your counter. Branded storefront, live inventory, pickup checkout, buylist, want lists, and set alerts. $450 a month.',
    path: '/for-stores',
  })

  useJsonLd('for-stores', {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: 'LGS Card Vault',
    applicationCategory: 'BusinessApplication',
    operatingSystem: 'Web',
    url: 'https://lgscardvault.com/for-stores',
    description:
      'Storefront and inventory software for US local game stores. Pickup-only checkout; the store is merchant of record.',
    offers: {
      '@type': 'AggregateOffer',
      priceCurrency: 'USD',
      lowPrice: '450.00',
      highPrice: '450.00',
      offerCount: 2,
      url: 'https://lgscardvault.com/for-stores#pricing',
    },
  })

  const heroCtaSize = 'h-12 w-full px-6 text-sm sm:w-auto'
  const primaryCta = cx(buttonVariants({ variant: 'primary', size: 'lg' }), heroCtaSize)
  const secondaryCta =
    'inline-flex h-12 w-full items-center justify-center gap-2 rounded-btn border border-border bg-surface px-6 text-sm font-bold text-fg shadow-sm transition-colors hover:bg-bg sm:w-auto dark:border-white/10 dark:bg-white/[0.04] dark:hover:bg-white/[0.08]'

  return (
    <div className="bg-bg">
      <section className="relative isolate overflow-hidden border-b border-border/60 dark:border-white/10">
        <div
          aria-hidden
          className="absolute inset-0 bg-[radial-gradient(ellipse_70%_80%_at_50%_-20%,rgba(198,160,53,0.14),transparent_58%)] dark:bg-[radial-gradient(ellipse_70%_80%_at_50%_-20%,rgba(198,160,53,0.12),transparent_58%)]"
        />

        <div className="relative z-10 mx-auto flex max-w-3xl flex-col items-center px-5 py-14 text-center sm:px-8 sm:py-16">
          <motion.p
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45, ease: EASE_PREMIUM }}
            className="rounded-full border border-brand-500/25 bg-brand-500/10 px-3 py-1 text-[0.7rem] font-extrabold uppercase tracking-[0.16em] text-brand-700 dark:text-brand-300"
          >
            For store owners
          </motion.p>
          <motion.h1
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: EASE_PREMIUM, delay: 0.06 }}
            className="mt-4 max-w-2xl text-display-sm sm:text-display-md"
          >
            Put your cases online. Keep the sale at your counter.
          </motion.h1>
          <motion.p
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: EASE_PREMIUM, delay: 0.12 }}
            className="mt-4 max-w-xl text-[0.95rem] font-medium leading-7 text-fg/75 sm:text-base dark:text-fg-muted"
          >
            A branded storefront for Magic, Pokémon, One Piece, Flesh &amp; Blood, and more. Live singles and
            sealed, pickup checkout, buylist, want lists, and set restock alerts.{' '}
            <span className="font-semibold text-fg">$450 a month.</span>
          </motion.p>
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: EASE_PREMIUM, delay: 0.18 }}
            className="mt-7 flex w-full max-w-sm flex-col items-stretch gap-3 sm:max-w-none sm:flex-row sm:flex-wrap sm:items-center sm:justify-center"
          >
            <Link to={applyHref} className={primaryCta}>
              {applyLabel}
              <ArrowRight aria-hidden className="size-4" />
            </Link>
            <a href="#pricing" className={secondaryCta}>
              <Layers aria-hidden className="size-4" />
              See pricing
            </a>
          </motion.div>
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.4, ease: EASE_PREMIUM, delay: 0.24 }}
            className="mt-4 text-sm font-medium text-fg-muted"
          >
            US stores · pickup only · you stay merchant of record
          </motion.p>
        </div>
      </section>

      <div className="relative z-10 mx-auto flex max-w-7xl flex-col gap-16 px-4 py-16 sm:gap-20 sm:px-6 sm:py-20 lg:px-8">
        <section>
          <Reveal className="space-y-2">
            <p className="text-eyebrow">Why stores use it</p>
            <h2 className="mt-2 text-display-sm sm:text-display-md">Stop letting old inventory collect dust.</h2>
            <p className="mt-3 max-w-2xl text-[0.95rem] font-medium leading-7 text-fg/75 dark:text-fg-muted">
              Cards that sit in the case still sell if players can find them. Put that stock online, and they come
              back to the same register with the list already paid or ready to settle.
            </p>
          </Reveal>
          <Stagger className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-3" gap={0.06}>
            {BENEFITS.map(({ icon: Icon, title, text }) => (
              <StaggerItem key={title} className="h-full">
                <div className="h-full rounded-card border border-border bg-surface p-5 shadow-card dark:border-white/10 dark:bg-white/[0.03]">
                  <span className="inline-flex size-11 items-center justify-center rounded-btn border border-brand-500/20 bg-brand-500/10 text-brand-600 dark:text-brand-300">
                    <Icon aria-hidden className="size-5" />
                  </span>
                  <h3 className="mt-4 font-display text-lg font-bold tracking-tight text-fg">{title}</h3>
                  <p className="mt-2 text-sm font-medium leading-6 text-fg/75 dark:text-fg-muted">{text}</p>
                </div>
              </StaggerItem>
            ))}
          </Stagger>
        </section>

        <section>
          <Reveal className="space-y-2">
            <p className="text-eyebrow">The product</p>
            <h2 className="mt-2 text-display-sm sm:text-display-md">The product, not a stock photo.</h2>
            <p className="mt-3 max-w-2xl text-[0.95rem] font-medium leading-7 text-fg/75 dark:text-fg-muted">
              Real shots of store admin: the sidebar, singles, sealed, and CSV imports. This is the console you
              run after you are approved.
            </p>
          </Reveal>
          <Reveal className="mt-8">
            <AdminProductShots />
          </Reveal>
        </section>

        <section>
          <Reveal className="space-y-2">
            <p className="text-eyebrow">How it works</p>
            <h2 className="mt-2 text-display-sm sm:text-display-md">From application to first pickup.</h2>
          </Reveal>
          <Stagger className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4" gap={0.06}>
            {STEPS.map((step) => (
              <StaggerItem key={step.n} className="h-full">
                <div className="h-full rounded-card border border-border bg-surface p-5 shadow-card dark:border-white/10 dark:bg-white/[0.03]">
                  <p className="font-display text-2xl font-bold tabular-nums text-brand-600">{step.n}</p>
                  <h3 className="mt-3 font-display text-lg font-bold tracking-tight text-fg">{step.title}</h3>
                  <p className="mt-2 text-sm font-medium leading-6 text-fg/75 dark:text-fg-muted">{step.text}</p>
                </div>
              </StaggerItem>
            ))}
          </Stagger>
        </section>

        <section id="pricing" className="scroll-mt-24">
          <Reveal className="space-y-2">
            <p className="text-eyebrow">Pricing</p>
            <h2 className="mt-2 text-display-sm sm:text-display-md">$450 a month. Every feature included.</h2>
            <p className="mt-3 max-w-2xl text-[0.95rem] font-medium leading-7 text-fg/75 dark:text-fg-muted">
              Pay the month in full up front, or put 10% of each day&apos;s online sales toward that $450. Any remainder
              charges at month end. Failed charges suspend the storefront after warnings and retries. Square and PayPal
              still take their normal card-processing rates on shopper checkout. That is separate from the platform fee.
            </p>
          </Reveal>
          <div className="mt-8">
            {plansPending ? (
              <p className="text-sm text-fg-muted">Loading plans…</p>
            ) : (
              <StorePlanCards plans={plans} applyHref={applyHref} ctaLabel={applyLabel} />
            )}
          </div>
        </section>

        <Reveal
          id="contact"
          className="scroll-mt-24 overflow-hidden rounded-card border border-border bg-surface shadow-card dark:border-white/10 dark:bg-white/[0.03]"
        >
          <div className="grid gap-8 p-6 sm:p-8 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
            <div>
              <p className="text-eyebrow">Talk to us</p>
              <h2 className="mt-2.5 text-display-sm sm:text-display-md">Questions before you apply?</h2>
              <p className="mt-3 max-w-xl text-[0.95rem] font-medium leading-7 text-fg/75 dark:text-fg-muted">
                Onboarding, inventory import, or whether your shop is a fit. Send a note or email{' '}
                <a href="mailto:hello@lgscardvault.com" className="font-semibold text-brand-600 hover:underline">
                  hello@lgscardvault.com
                </a>
                .
              </p>
            </div>
            <ContactForm />
          </div>
        </Reveal>

        <Reveal className="overflow-hidden rounded-card border border-brand-500/30 bg-brand-500/10 px-6 py-10 text-center sm:px-10">
          <h2 className="text-display-sm sm:text-display-md">Ready when your cases are.</h2>
          <p className="mx-auto mt-3 max-w-xl text-[0.95rem] font-medium leading-7 text-fg/75 dark:text-fg-muted">
            Open a verified storefront, import what you stock, and send players to your door.
          </p>
          <Link to={applyHref} className={cx(primaryCta, 'mt-6 inline-flex')}>
            {applyLabel}
            <ArrowRight aria-hidden className="size-4" />
          </Link>
        </Reveal>
      </div>
    </div>
  )
}
