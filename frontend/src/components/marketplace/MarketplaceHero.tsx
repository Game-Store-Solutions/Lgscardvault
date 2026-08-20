import { ArrowRight, ShieldCheck } from 'lucide-react'
import { motion, useReducedMotion } from 'framer-motion'
import { Link } from 'react-router'
import type { InventoryItem, Store } from '../../api/types'
import { BrandLogo } from '../BrandLogo'
import { CollectibleCard } from './CollectibleCard'
import { buttonVariants } from '../ui'
import { cx } from '../../lib/cx'

type MarketplaceHeroProps = {
  featuredStore?: Store | null
  featuredCards: InventoryItem[]
}

export function MarketplaceHero({ featuredStore, featuredCards }: MarketplaceHeroProps) {
  const reduceMotion = useReducedMotion()
  const cards = featuredCards.slice(0, 3)

  return (
    <section className="market-hero relative overflow-hidden rounded-[1.75rem] border border-white/8 bg-[#0f1014] px-6 py-8 shadow-[0_30px_100px_-50px_rgba(0,0,0,0.9)] sm:px-8 lg:px-10 lg:py-10">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(220,38,38,0.18),transparent_34%),radial-gradient(circle_at_75%_20%,rgba(255,255,255,0.06),transparent_20%),linear-gradient(180deg,#111113_0%,#09090b_100%)]" />
      <div className="absolute inset-0 opacity-[0.08]" style={{ backgroundImage: 'linear-gradient(rgba(255,255,255,0.14) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.14) 1px, transparent 1px)', backgroundSize: '34px 34px' }} />

      <div className="relative z-10 grid gap-10 lg:grid-cols-[minmax(0,1.15fr)_minmax(320px,0.85fr)] lg:items-center">
        <div className="max-w-2xl space-y-8">
          <motion.div
            initial={reduceMotion ? undefined : { opacity: 0, y: 18 }}
            animate={reduceMotion ? undefined : { opacity: 1, y: 0 }}
            transition={{ duration: 0.45 }}
            className="space-y-6"
          >
            <div className="inline-flex items-center gap-3 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs font-semibold uppercase tracking-[0.24em] text-zinc-300">
              <BrandLogo size="sm" to={null} />
              Premium TCG marketplace
            </div>

            <div className="space-y-5">
              <h1 className="max-w-xl text-5xl font-semibold uppercase tracking-[-0.08em] text-white sm:text-6xl lg:text-7xl">
                Build your vault.
              </h1>
              <p className="max-w-xl text-base leading-7 text-zinc-300 sm:text-lg">
                Discover, collect and trade the cards you love across trusted local game stores, curated storefronts, and high-signal inventory.
              </p>
            </div>

            <div className="flex flex-wrap gap-3">
              <Link to="/stores" className={buttonVariants({ variant: 'primary', size: 'xl' })}>
                Explore Cards
                <ArrowRight className="size-4" />
              </Link>
              <Link
                to="/register/owner"
                className={cx(
                  buttonVariants({ variant: 'outline', size: 'xl' }),
                  'border-white/14 bg-white/5 text-white hover:bg-white/8 hover:text-white',
                )}
              >
                Sell Your Collection
              </Link>
            </div>
          </motion.div>

          <motion.div
            initial={reduceMotion ? undefined : { opacity: 0, y: 18 }}
            animate={reduceMotion ? undefined : { opacity: 1, y: 0 }}
            transition={{ duration: 0.45, delay: 0.08 }}
            className="grid gap-3 sm:grid-cols-3"
          >
            {[
              'Collector-first product detail',
              'Storefronts powered by real LGS inventory',
              'Favorites, carts, and trade flows already live',
            ].map((item) => (
              <div key={item} className="rounded-2xl border border-white/8 bg-white/[0.03] p-4 text-sm text-zinc-300">
                {item}
              </div>
            ))}
          </motion.div>
        </div>

        <motion.div
          initial={reduceMotion ? undefined : { opacity: 0, scale: 0.98 }}
          animate={reduceMotion ? undefined : { opacity: 1, scale: 1 }}
          transition={{ duration: 0.5, delay: 0.12 }}
          className="space-y-4"
        >
          <div className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3">
            <div>
              <p className="text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-zinc-400">Featured storefront</p>
              <p className="mt-1 text-sm font-medium text-white">{featuredStore?.name ?? "Collector's pick"}</p>
            </div>
            <div className="inline-flex items-center gap-2 rounded-full bg-emerald-500/10 px-3 py-1 text-xs font-semibold text-emerald-300">
              <ShieldCheck className="size-3.5" />
              Trusted
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {cards.map((item, index) => (
              <motion.div
                key={item.id}
                initial={reduceMotion ? undefined : { opacity: 0, y: 20, rotate: index === 1 ? 0 : index === 0 ? -2 : 2 }}
                animate={reduceMotion ? undefined : { opacity: 1, y: 0, rotate: index === 1 ? 0 : index === 0 ? -2 : 2 }}
                transition={{ duration: 0.4, delay: 0.14 + index * 0.06 }}
                className={index === 1 ? 'sm:translate-y-8' : ''}
              >
                <CollectibleCard
                  item={item}
                  slug={featuredStore?.slug ?? ''}
                  storeName={featuredStore?.name ?? undefined}
                  showStore={false}
                />
              </motion.div>
            ))}
          </div>
        </motion.div>
      </div>
    </section>
  )
}

export default MarketplaceHero
