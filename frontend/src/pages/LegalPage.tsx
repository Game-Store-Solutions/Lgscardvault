import { Link, useLocation } from 'react-router'
import { useQuery } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import api from '../api/client'
import { DEFAULT_APP_SHELL } from '../lib/layoutShell'
import { LegalLinks } from '../components/legal/LegalLinks'

interface LegalSite {
  entityName: string
  contactEmail: string
  address: string
  pickupOnly: boolean
  country: string
}

const FALLBACK: LegalSite = {
  entityName: 'LGS Card Vault',
  contactEmail: 'privacy@lgscardvault.com',
  address: '',
  pickupOnly: true,
  country: 'US',
}

const SLUGS = ['privacy', 'terms', 'pickup', 'merchant-terms'] as const
type LegalSlug = (typeof SLUGS)[number]

const TITLES: Record<LegalSlug, string> = {
  privacy: 'Privacy Policy',
  terms: 'Terms of Service',
  pickup: 'Pickup & refunds',
  'merchant-terms': 'Merchant terms',
}

export default function LegalPage() {
  const path = useLocation().pathname.replace(/^\//, '')
  const legalSlug: LegalSlug = (SLUGS as readonly string[]).includes(path) ? (path as LegalSlug) : 'privacy'
  const { data: site = FALLBACK } = useQuery({
    queryKey: ['legal-site'],
    queryFn: async () => {
      const { data } = await api.get<LegalSite>('/legal/site')
      return data
    },
    staleTime: 60 * 60 * 1000,
  })

  return (
    <article className={DEFAULT_APP_SHELL + ' max-w-3xl pb-16'}>
      <p className="text-xs font-bold uppercase tracking-[0.16em] text-brand-600">Legal</p>
      <h1 className="mt-2 font-display text-3xl font-bold tracking-tight text-fg sm:text-4xl">{TITLES[legalSlug]}</h1>
      <p className="mt-2 text-sm text-fg-muted">Last updated August 22, 2026 · {site.entityName}</p>
      <LegalLinks className="mt-4" />

      <div className="prose-legal mt-8 space-y-6 text-sm leading-7 text-fg">
        {legalSlug === 'privacy' && <PrivacyPolicy site={site} />}
        {legalSlug === 'terms' && <TermsOfService site={site} />}
        {legalSlug === 'pickup' && <PickupPolicy site={site} />}
        {legalSlug === 'merchant-terms' && <MerchantTerms site={site} />}
      </div>
    </article>
  )
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h2 className="font-display text-lg font-bold text-fg">{title}</h2>
      <div className="mt-2 space-y-3 text-fg/80">{children}</div>
    </section>
  )
}

function PrivacyPolicy({ site }: { site: LegalSite }) {
  return (
    <>
      <p>
        This Privacy Policy describes how {site.entityName} (“we”, “us”) collects, uses, and shares personal
        information when you use our website and storefronts. Each local game store that lists inventory is an
        independent business. We provide the software; that store is the merchant of record for your purchase.
      </p>
      <Section title="Information we collect">
        <p>
          Account details (name, email, password or single sign-on identifiers), store profiles, order details
          (items, pickup name, optional email), sell/trade submissions, customer support messages, and device
          data such as IP address and basic logs needed to run the service.
        </p>
        <p>
          Payments are processed by Square. We do not store full card numbers. Square may receive the amount,
          store location, and limited billing details needed to complete the charge.
        </p>
      </Section>
      <Section title="How we use information">
        <p>
          We use personal information to operate storefronts, process pickup orders, prevent fraud and abuse,
          send transactional email (verification, receipts, “ready for pickup”), and improve the product. We do
          not sell personal information.
        </p>
      </Section>
      <Section title="Sharing">
        <p>
          We share information with the store you buy from (so they can fulfill pickup), with Square for
          payments, with email delivery providers, and if required by law. Stores see the order information
          needed to pull your cards and identify you at the counter.
        </p>
      </Section>
      <Section title="Retention and deletion">
        <p>
          You can delete your shopper account from Account settings. Store owners must transfer or close their
          storefronts first. Order records may be retained as required for tax, accounting, and fraud prevention.
        </p>
      </Section>
      <Section title="California privacy rights">
        <p>
          If you are a California resident, you may request access to the personal information we hold about you
          or ask us to delete it, subject to legal exceptions. Email {site.contactEmail}. We will not discriminate
          against you for exercising these rights. We do not sell or share personal information as those terms
          are defined under the CCPA/CPRA.
        </p>
      </Section>
      <Section title="Children">
        <p>The service is intended for users 13 and older. We do not knowingly collect personal information from children under 13.</p>
      </Section>
      <Section title="Contact">
        <p>
          Privacy requests: <a className="font-semibold text-brand-600 hover:underline" href={`mailto:${site.contactEmail}`}>{site.contactEmail}</a>
          {site.address ? `. Mailing address: ${site.address}.` : '.'}
        </p>
      </Section>
    </>
  )
}

function TermsOfService({ site }: { site: LegalSite }) {
  return (
    <>
      <p>
        These Terms govern your use of {site.entityName}. By creating an account or placing an order you agree to
        them. If you open a store, the <Link className="font-semibold text-brand-600 hover:underline" to="/merchant-terms">Merchant terms</Link> also apply.
      </p>
      <Section title="The marketplace and the stores">
        <p>
          {site.entityName} is software for local game stores. When you buy cards or sealed product, you are
          buying from that store, not from us. The store sets prices, inventory, and pickup hours. Payment is
          charged to the store’s Square account. We are not the seller of the cards.
        </p>
      </Section>
      <Section title="Pickup only">
        <p>
          Orders are paid online (or reserved to pay at the counter) and picked up at the store. We do not offer
          shipping. You are responsible for collecting your order during the store’s posted hours.
        </p>
      </Section>
      <Section title="Sales tax">
        <p>
          Sales tax is charged at the store’s location for pickup orders, using tax rates configured on that
          store’s Square account. Tax appears on checkout before you pay.
        </p>
      </Section>
      <Section title="Accounts">
        <p>
          You must provide accurate information and keep your password confidential. You must be at least 13.
          We may suspend accounts for fraud, abuse, or violation of these terms.
        </p>
      </Section>
      <Section title="Card images and trademarks">
        <p>
          Card names, artwork, and related marks belong to their publishers (including Wizards of the Coast,
          The Pokémon Company, and others). We display them to help you identify product. This site is not
          endorsed by those publishers.
        </p>
      </Section>
      <Section title="Limitation of liability">
        <p>
          The service is provided as-is. To the fullest extent permitted by law, {site.entityName} is not liable
          for inventory mistakes, store hours, or disputes between you and a store. Your remedy for a purchase
          issue is with the store that sold the items, as described in Pickup & refunds.
        </p>
      </Section>
      <Section title="Contact">
        <p>
          Questions: <a className="font-semibold text-brand-600 hover:underline" href={`mailto:${site.contactEmail}`}>{site.contactEmail}</a>
        </p>
      </Section>
    </>
  )
}

function PickupPolicy({ site }: { site: LegalSite }) {
  return (
    <>
      <p>
        This policy applies to shopper orders on {site.entityName}. Every order is <strong>pickup at the store</strong>.
        There is no shipping.
      </p>
      <Section title="Paying online">
        <p>
          You can pay with a card or wallet through Square, then pick up at the counter. The store holds the
          items after a successful payment. Bring a photo ID or the name on the order.
        </p>
      </Section>
      <Section title="Paying in store">
        <p>
          You can reserve inventory and pay at the counter. Sales tax for reserved orders is collected when you
          pay the store. Uncollected reserves may be released if you do not pick up in a reasonable time set by
          the store.
        </p>
      </Section>
      <Section title="Refunds and cancellations">
        <p>
          The selling store handles refunds. If staff cancel or refund a card-paid order in store admin, the
          Square payment is refunded and stock is restocked. Contact the store first; {site.entityName} does not
          hold your payment.
        </p>
      </Section>
      <Section title="Condition and authenticity">
        <p>
          Cards are described by the listing store. Inspect items at pickup. Condition disputes are between you
          and the store.
        </p>
      </Section>
    </>
  )
}

function MerchantTerms({ site }: { site: LegalSite }) {
  return (
    <>
      <p>
        These Merchant terms are the agreement between {site.entityName} and each store owner. Opening a storefront
        means you accept them.
      </p>
      <Section title="You are the merchant">
        <p>
          You sell your own inventory. Shopper payments settle to your connected Square account. You are
          responsible for pricing, stock accuracy, pickup, customer service, refunds, chargebacks, and all
          taxes on those sales.
        </p>
      </Section>
      <Section title="United States only, pickup only">
        <p>
          Storefronts must be located in the United States. Checkout is pickup only. Do not offer shipping
          through this platform.
        </p>
      </Section>
      <Section title="Sales tax">
        <p>
          You must hold any required seller’s permit and configure sales tax on your Square location so pickup
          orders collect the correct local tax. {site.entityName} does not file sales tax returns for your store.
        </p>
      </Section>
      <Section title="Buy / trade">
        <p>
          If you buy or trade cards from the public, you are responsible for secondhand-dealer, pawn, and local
          reporting rules in your city and state. Complete those transactions in person when the law requires it.
        </p>
      </Section>
      <Section title="Square and fees">
        <p>
          You must keep a valid Square connection to take card payments. Square’s fees are charged by Square.
          Platform subscription fees (if any) are billed separately to you by {site.entityName}.
        </p>
      </Section>
      <Section title="Prohibited use">
        <p>
          No illegal listings, counterfeit product, or use of the service to collect card data outside Square.
          We may suspend a storefront that creates legal or fraud risk.
        </p>
      </Section>
      <Section title="Contact">
        <p>
          <a className="font-semibold text-brand-600 hover:underline" href={`mailto:${site.contactEmail}`}>{site.contactEmail}</a>
        </p>
      </Section>
    </>
  )
}
