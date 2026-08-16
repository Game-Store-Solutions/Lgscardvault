import { Link } from 'react-router'
import { ArrowRight, LayoutGrid, Store, UserPlus } from 'lucide-react'
import { BrandLogo } from './BrandLogo'
import { FloatingCardsBackdrop } from './FloatingCardsBackdrop'
import { useAuth } from '../context/AuthContext'
import { useActiveStores } from '../hooks'
import { useAppShellFlush } from './layout/AppShellLayout'

/**
 * Full-bleed marketing hero for logged-out visitors.
 * Light: navy + gold on soft grey. Dark: crimson on near-black.
 */
export default function MarketplaceLanding() {
  const { user, isSuperAdmin } = useAuth()
  const { data: stores = [], isSuccess } = useActiveStores()
  const hasStores = isSuccess && stores.length > 0
  useAppShellFlush(true)

  const primaryCta =
    'inline-flex h-12 items-center justify-center gap-2 rounded-btn bg-brand-500 px-6 text-sm font-bold text-white shadow-sm transition-colors hover:bg-brand-600'
  const secondaryCta =
    'inline-flex h-12 items-center justify-center gap-2 rounded-btn border-2 border-accent-500 bg-surface px-6 text-sm font-bold text-fg shadow-sm transition-colors hover:bg-accent-500 hover:text-[#0a1627] dark:border-accent-500 dark:bg-surface/80 dark:hover:bg-accent-500 dark:hover:text-bg'

  return (
    <section className="relative isolate min-h-[calc(100dvh-3.75rem)] w-full overflow-hidden bg-bg">
      <div
        aria-hidden
        className="absolute inset-0 bg-[radial-gradient(ellipse_80%_60%_at_50%_-10%,rgba(198,160,53,0.16),transparent_55%),radial-gradient(ellipse_55%_45%_at_90%_80%,rgba(10,22,39,0.04),transparent_50%),linear-gradient(165deg,#fafafa_0%,#f3f4f6_48%,#e5e7eb_100%)] dark:bg-[radial-gradient(ellipse_80%_60%_at_50%_-10%,rgba(220,38,38,0.2),transparent_55%),radial-gradient(ellipse_50%_40%_at_90%_80%,rgba(220,38,38,0.06),transparent_50%),linear-gradient(165deg,#0a0a0b_0%,#171717_42%,#0a0a0b_100%)]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.28] dark:opacity-[0.35]"
        style={{
          backgroundImage:
            'linear-gradient(rgba(10,10,11,0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(10,10,11,0.06) 1px, transparent 1px)',
          backgroundSize: '48px 48px',
          maskImage: 'radial-gradient(ellipse at center, black 20%, transparent 75%)',
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 hidden opacity-[0.35] dark:block"
        style={{
          backgroundImage:
            'linear-gradient(rgba(220,38,38,0.07) 1px, transparent 1px), linear-gradient(90deg, rgba(220,38,38,0.07) 1px, transparent 1px)',
          backgroundSize: '48px 48px',
          maskImage: 'radial-gradient(ellipse at center, black 20%, transparent 75%)',
        }}
      />

      <FloatingCardsBackdrop
        layout="scatter"
        washClassName="bg-[radial-gradient(ellipse_52%_48%_at_50%_48%,#fafafa_0%,#f3f4f6e6_42%,transparent_72%)] dark:bg-[radial-gradient(ellipse_52%_48%_at_50%_48%,#0a0a0bf2_0%,#171717cc_40%,transparent_72%)]"
      />

      <div className="relative z-10 mx-auto flex min-h-[calc(100dvh-3.75rem)] max-w-3xl flex-col items-center justify-center px-6 pb-16 pt-10 text-center sm:px-10">
        <BrandLogo
          size="hero"
          variant="auto"
          to={null}
          className="drop-shadow-[0_12px_40px_rgba(10,10,11,0.12)] dark:drop-shadow-[0_12px_40px_rgba(220,38,38,0.28)]"
        />

        <h1 className="mt-12 max-w-2xl font-display text-3xl font-bold tracking-tight text-fg sm:text-5xl sm:leading-[1.08]">
          The vault for every local game store
        </h1>
        <p className="mt-4 max-w-lg text-base font-medium leading-relaxed text-zinc-800 drop-shadow-[0_1px_10px_rgba(243,244,246,0.95)] dark:text-zinc-100 dark:drop-shadow-[0_2px_12px_rgba(10,10,11,0.95)] sm:text-lg">
          Magic, Pokémon, One Piece, Flesh &amp; Blood, and Riftbound from trusted LGSs.
        </p>

        <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
          {hasStores && (
            <Link to="/stores" className={primaryCta}>
              <LayoutGrid aria-hidden className="size-4" />
              View stores
              <ArrowRight aria-hidden className="size-4" />
            </Link>
          )}

          {isSuperAdmin ? (
            <Link to="/platform/admin" className={hasStores ? secondaryCta : primaryCta}>
              <Store aria-hidden className="size-4" />
              Open a store
              {!hasStores && <ArrowRight aria-hidden className="size-4" />}
            </Link>
          ) : (
            <Link to="/register/owner" className={hasStores ? secondaryCta : primaryCta}>
              <Store aria-hidden className="size-4" />
              Start your store
              {!hasStores && <ArrowRight aria-hidden className="size-4" />}
            </Link>
          )}

          {!user && (
            <>
              <Link to="/register/customer" className={secondaryCta}>
                <UserPlus aria-hidden className="size-4" />
                Create account
              </Link>
              <Link to="/login" className={secondaryCta}>
                Sign in
              </Link>
            </>
          )}
        </div>
      </div>
    </section>
  )
}
