import { Link } from 'react-router'
import { ShieldCheck, Sparkles, Store as StoreIcon, User } from 'lucide-react'

export interface AuthMarketingAsideProps {
  /** Small overline label. */
  eyebrow?: string
  /** Headline — usually the store name (store context) or the platform. */
  storeName?: string
  /** Marketing description copy. */
  description: string
  /** Background image (defaults to the marketplace collectibles shot). */
  imageUrl?: string
}

const FEATURES = [
  { icon: User, label: 'Customers', text: 'Favorites, want lists & one account across stores' },
  { icon: StoreIcon, label: 'Store owners', text: 'Manage inventory, orders & branding' },
  { icon: ShieldCheck, label: 'Trusted', text: 'Verified storefronts, secure checkout' },
]

/**
 * AuthMarketingAside — the immersive brand panel beside the auth form. A stock
 * marketplace image under a brand-colored gradient, a light logo lockup, a big
 * headline, and glassy role feature chips. Hidden on small screens (the form
 * takes the full width there).
 */
export default function AuthMarketingAside({ eyebrow = 'MTG Marketplace', storeName, description, imageUrl }: AuthMarketingAsideProps) {
  return (
    <aside className="relative hidden overflow-hidden lg:block">
      <img
        src={imageUrl ?? '/stock/hero-collectibles.jpg'}
        alt=""
        aria-hidden
        className="absolute inset-0 size-full object-cover"
      />
      {/* Brand gradient wash for legibility + identity */}
      <div
        aria-hidden
        className="absolute inset-0"
        style={{
          background:
            'linear-gradient(150deg, rgba(74,61,196,0.94) 0%, rgba(109,94,252,0.82) 42%, rgba(15,17,23,0.72) 100%)',
        }}
      />

      <div className="relative flex h-full flex-col justify-between p-10 text-white xl:p-14">
        <Link to="/" className="inline-flex items-center gap-2 font-display text-lg font-bold tracking-tight">
          <span className="grid size-9 place-items-center rounded-btn bg-white/15 text-sm font-bold backdrop-blur">
            MTG
          </span>
          <span>MTG Marketplace</span>
        </Link>

        <div className="max-w-md">
          <p className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-[0.3em] text-white/80">
            <Sparkles aria-hidden className="size-4" />
            {eyebrow}
          </p>
          <h2 className="mt-5 font-display text-4xl font-bold leading-[1.1] tracking-tight xl:text-5xl">
            {storeName ?? 'Shop Magic singles from trusted local stores'}
          </h2>
          <p className="mt-5 max-w-sm text-base leading-relaxed text-white/85">{description}</p>
        </div>

        <div className="grid gap-3">
          {FEATURES.map(({ icon: Icon, label, text }) => (
            <div
              key={label}
              className="flex items-start gap-3 rounded-card border border-white/15 bg-white/10 p-3.5 backdrop-blur-sm"
            >
              <span className="grid size-9 flex-shrink-0 place-items-center rounded-btn bg-white/15">
                <Icon aria-hidden className="size-4" />
              </span>
              <div>
                <p className="text-sm font-bold">{label}</p>
                <p className="text-xs text-white/75">{text}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </aside>
  )
}
