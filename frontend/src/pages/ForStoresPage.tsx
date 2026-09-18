import { Link } from 'react-router'
import { ArrowRight } from 'lucide-react'
import { ContactForm } from '../components/ContactForm'
import { StorePlanCards } from '../components/marketing/StorePlanCards'
import { AdminHeroShot, AdminProductShots } from '../components/marketing/StoreProductPreviews'
import { useAppShellFlush } from '../components/layout/AppShellLayout'
import { buttonVariants } from '../components/ui'
import { useOnboardingDraft } from '../hooks'
import { usePageMeta, useJsonLd } from '../hooks/usePageMeta'
import { usePreservedHref } from '../hooks/usePreservedHref'
import { cx } from '../lib/cx'
import { usePublicPlans } from '../lib/plans'
import { isOnboardingDraftInProgress } from './onboarding/draftStorage'

const BENEFITS = [
  {
    title: 'A storefront that looks like your shop',
    text: 'Your name, logo, and colors. Players browse your singles and sealed, not a generic marketplace grid.',
  },
  {
    title: 'Inventory that matches the shelf',
    text: 'CSV import or hand edits. Quantity, condition, and finish stay in sync so listings are cards you actually have.',
  },
  {
    title: 'Pickup checkout, you keep the sale',
    text: 'Square or pay-in-store. You are the merchant of record. No shipping. They pick up at your counter.',
  },
  {
    title: 'Buylist without a second system',
    text: 'Players submit sell and trade lists. You review, offer cash or store credit, and keep the relationship in-house.',
  },
  {
    title: 'Want lists and set restock alerts',
    text: 'Players watch cards and sets at your store. When stock comes back in, they get one notice, and you get the visit.',
  },
  {
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
  const secondaryCta = cx(
    'inline-flex h-12 w-full items-center justify-center gap-2 rounded-btn border px-6 text-sm font-bold transition-colors sm:w-auto',
    'border-border bg-surface text-fg hover:bg-bg',
    'dark:border-white/30 dark:bg-transparent dark:text-white dark:hover:bg-white/10',
  )

  return (
    <div className="bg-bg">
      <section className="border-b border-border">
        <div className="mx-auto grid max-w-7xl items-center gap-10 px-5 py-12 sm:px-8 lg:grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)] lg:gap-14 lg:px-8 lg:py-16">
          <div>
            <p className="text-sm font-semibold text-fg-muted">For US local game stores</p>
            <h1 className="mt-3 max-w-xl text-display-sm sm:text-display-md">
              Put your cases online. Keep the sale at your counter.
            </h1>
            <p className="mt-4 max-w-xl text-[0.95rem] font-medium leading-7 text-fg/75 dark:text-fg-muted">
              A branded storefront for Magic, Pokémon, One Piece, Flesh &amp; Blood, and more. Live singles and
              sealed, pickup checkout, buylist, want lists, and set restock alerts.{' '}
              <span className="font-semibold text-fg">$450 a month.</span>
            </p>
            <div className="mt-7 flex w-full max-w-sm flex-col items-stretch gap-3 sm:max-w-none sm:flex-row sm:flex-wrap">
              <Link to={applyHref} className={primaryCta}>
                {applyLabel}
                <ArrowRight aria-hidden className="size-4" />
              </Link>
              <a href="#pricing" className={secondaryCta}>
                See pricing
              </a>
            </div>
            <p className="mt-4 text-sm font-medium text-fg-muted">
              US stores · pickup only · you stay merchant of record
            </p>
          </div>
          <AdminHeroShot />
        </div>
      </section>

      <section id="admin" className="scroll-mt-24 bg-[#0a1627] text-white">
        <div className="mx-auto max-w-7xl px-5 py-14 sm:px-8 sm:py-16 lg:px-8">
          <p className="text-[0.7rem] font-bold uppercase tracking-[0.16em] text-white/45">Store admin</p>
          <h2 className="mt-3 max-w-2xl text-display-sm sm:text-display-md">The console you run after approval.</h2>
          <p className="mt-3 max-w-2xl text-[0.95rem] font-medium leading-7 text-white/70">
            Sidebar, singles, sealed, and CSV imports. Same screens a shop uses to stock the site and take
            pickup orders.
          </p>
          <div className="mt-8">
            <AdminProductShots />
          </div>
        </div>
      </section>

      <div className="mx-auto flex max-w-7xl flex-col gap-16 px-5 py-14 sm:gap-20 sm:px-8 sm:py-20 lg:px-8">
        <section>
          <p className="text-sm font-semibold text-fg-muted">Why stores use it</p>
          <h2 className="mt-2 text-display-sm sm:text-display-md">Stop letting old inventory collect dust.</h2>
          <p className="mt-3 max-w-2xl text-[0.95rem] font-medium leading-7 text-fg/75 dark:text-fg-muted">
            Cards that sit in the case still sell if players can find them. Put that stock online, and they come
            back to the same register with the list already paid or ready to settle.
          </p>
          <div className="mt-10 grid border-t border-border sm:grid-cols-2">
            {BENEFITS.map((benefit) => (
              <article
                key={benefit.title}
                className="border-b border-border py-6 sm:px-6 sm:odd:pl-0 sm:even:border-l sm:even:pr-0"
              >
                <h3 className="font-display text-lg font-bold tracking-tight text-fg">{benefit.title}</h3>
                <p className="mt-2 text-sm font-medium leading-6 text-fg/75 dark:text-fg-muted">{benefit.text}</p>
              </article>
            ))}
          </div>
        </section>

        <section>
          <p className="text-sm font-semibold text-fg-muted">How it works</p>
          <h2 className="mt-2 text-display-sm sm:text-display-md">From application to first pickup.</h2>
          <ol className="mt-10 grid gap-8 border-t border-border pt-8 sm:grid-cols-2 xl:grid-cols-4">
            {STEPS.map((step) => (
              <li key={step.n}>
                <p className="text-xs font-bold tabular-nums text-fg-muted">{step.n}</p>
                <h3 className="mt-2 font-display text-lg font-bold tracking-tight text-fg">{step.title}</h3>
                <p className="mt-2 text-sm font-medium leading-6 text-fg/75 dark:text-fg-muted">{step.text}</p>
              </li>
            ))}
          </ol>
        </section>

        <section id="pricing" className="scroll-mt-24">
          <p className="text-sm font-semibold text-fg-muted">Pricing</p>
          <h2 className="mt-2 text-display-sm sm:text-display-md">$450 a month. Every feature included.</h2>
          <p className="mt-3 max-w-2xl text-[0.95rem] font-medium leading-7 text-fg/75 dark:text-fg-muted">
            Pay the month in full up front, or put 10% of each day&apos;s online sales toward that $450. Any remainder
            charges at month end. Failed charges suspend the storefront after warnings and retries. Square and PayPal
            still take their normal card-processing rates on shopper checkout. That is separate from the platform fee.
          </p>
          <div className="mt-8">
            {plansPending ? (
              <p className="text-sm text-fg-muted">Loading plans…</p>
            ) : (
              <StorePlanCards plans={plans} applyHref={applyHref} ctaLabel={applyLabel} />
            )}
          </div>
        </section>

        <section id="contact" className="scroll-mt-24 border-t border-border pt-12">
          <div className="grid gap-8 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
            <div>
              <p className="text-sm font-semibold text-fg-muted">Talk to us</p>
              <h2 className="mt-2.5 text-display-sm sm:text-display-md">Questions before you apply?</h2>
              <p className="mt-3 max-w-xl text-[0.95rem] font-medium leading-7 text-fg/75 dark:text-fg-muted">
                Onboarding, inventory import, or whether your shop is a fit. Send a note or email{' '}
                <a href="mailto:hello@lgscardvault.com" className="font-semibold text-fg underline decoration-border underline-offset-4 hover:decoration-fg">
                  hello@lgscardvault.com
                </a>
                .
              </p>
            </div>
            <ContactForm />
          </div>
        </section>
      </div>

      <section className="bg-[#0a1627] px-5 py-12 text-white sm:px-8 sm:py-14">
        <div className="mx-auto max-w-3xl text-center">
          <h2 className="text-display-sm sm:text-display-md">Ready when your cases are.</h2>
          <p className="mx-auto mt-3 max-w-xl text-[0.95rem] font-medium leading-7 text-white/70">
            Open a verified storefront, import what you stock, and send players to your door.
          </p>
          <Link
            to={applyHref}
            className="mt-6 inline-flex h-12 items-center justify-center gap-2 rounded-btn bg-white px-6 text-sm font-bold text-[#0a1627] transition-colors hover:bg-white/90"
          >
            {applyLabel}
            <ArrowRight aria-hidden className="size-4" />
          </Link>
        </div>
      </section>
    </div>
  )
}
