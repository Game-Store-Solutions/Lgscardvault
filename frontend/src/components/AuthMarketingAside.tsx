import { ShieldCheck, Sparkles, Store as StoreIcon, User } from 'lucide-react'
import { BrandLogo } from './BrandLogo'
import { FloatingCardsBackdrop } from './FloatingCardsBackdrop'

export interface AuthMarketingAsideProps {
  /** Small overline label. */
  eyebrow?: string
  /** Headline — usually the store name (store context) or the platform. */
  storeName?: string
  /** Marketing description copy. */
  description: string
  /** @deprecated Stock photos replaced by floating TCG cards; ignored. */
  imageUrl?: string
}

const FEATURES = [
  { icon: User, label: 'Customers', text: 'Favorites, want lists & one account across stores' },
  { icon: StoreIcon, label: 'Store owners', text: 'Manage inventory, orders & branding' },
  { icon: ShieldCheck, label: 'Trusted', text: 'Verified storefronts, secure checkout' },
]

/**
 * Auth marketing panel — navy/gold soft grey in light, crimson near-black in dark,
 * with floating multi-game cards behind the copy.
 */
export default function AuthMarketingAside({ eyebrow = 'LGS Card Vault', storeName, description }: AuthMarketingAsideProps) {
  return (
    <aside className="relative hidden overflow-hidden bg-bg dark:bg-[#0a0a0b] lg:block">
      <div
        aria-hidden
        className="absolute inset-0 bg-[radial-gradient(ellipse_70%_55%_at_80%_25%,rgba(198,160,53,0.14),transparent_55%),linear-gradient(165deg,#fafafa_0%,#f3f4f6_48%,#e5e7eb_100%)] dark:bg-[radial-gradient(ellipse_70%_50%_at_70%_20%,rgba(220,38,38,0.18),transparent_55%),linear-gradient(165deg,#0a0a0b_0%,#171717_55%,#0a0a0b_100%)]"
      />
      <FloatingCardsBackdrop
        layout="right"
        washClassName="bg-gradient-to-r from-[#f3f4f6] via-[#f3f4f6]/88 to-[#f3f4f6]/25 dark:from-[#0a0a0b] dark:via-[#171717]/88 dark:to-[#171717]/30"
      />

      <div className="relative z-10 flex h-full flex-col justify-between p-10 text-fg xl:p-14">
        <BrandLogo size="md" variant="auto" withWordmark />

        <div className="max-w-md">
          <p className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-[0.3em] text-fg-muted">
            <Sparkles aria-hidden className="size-4 text-accent-500 dark:text-brand-500" />
            {eyebrow}
          </p>
          <h2 className="mt-5 font-display text-4xl font-bold leading-[1.1] tracking-tight text-fg xl:text-5xl">
            {storeName ?? 'Shop singles from trusted local stores'}
          </h2>
          <p className="mt-5 max-w-sm text-base leading-relaxed text-fg-muted">{description}</p>
        </div>

        <div className="grid gap-3">
          {FEATURES.map(({ icon: Icon, label, text }) => (
            <div
              key={label}
              className="flex items-start gap-3 rounded-card bg-surface/90 p-3.5 shadow-sm ring-1 ring-black/[0.04] backdrop-blur-sm dark:bg-white/10 dark:ring-white/10 dark:shadow-none"
            >
              <span className="grid size-9 flex-shrink-0 place-items-center rounded-btn bg-brand-50 text-brand-500 dark:bg-white/15 dark:text-brand-400">
                <Icon aria-hidden className="size-4" />
              </span>
              <div>
                <p className="text-sm font-bold text-fg">{label}</p>
                <p className="text-xs text-fg-muted">{text}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </aside>
  )
}
