import { Link } from 'react-router'
import { useQuery } from '@tanstack/react-query'
import { Timer } from 'lucide-react'
import api from '../../api/client'
import type { TradeRates } from '../../api/types'
import { usePromoCountdown } from '../../hooks/usePromoCountdown'

/**
 * Storefront banner shown while a store's trade-in promo window is live.
 * Painted with the store's brand palette (the theme hook maps brand-* to
 * the store's colors), with the boosted rates and a live countdown.
 * Renders nothing when no promo is running.
 */
export function TradePromoBanner({ slug, showSellLink = false }: { slug: string; showSellLink?: boolean }) {
  const { data: rates } = useQuery({
    // Same key as the sell/trade page so the two share one fetch.
    queryKey: ['trade-rates', slug] as const,
    enabled: Boolean(slug),
    queryFn: async () => {
      const { data } = await api.get<TradeRates>(`/stores/${slug}/trade-rates`)
      return data
    },
  })
  const countdown = usePromoCountdown(rates?.promoActive ? rates.promoEndsAt : null)

  if (!rates?.promoActive) return null

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-card bg-gradient-to-r from-brand-500 to-brand-700 px-4 py-3 text-white shadow-card">
      <Timer aria-hidden className="size-5 shrink-0" />
      <div className="min-w-0 flex-1">
        <p className="font-display font-bold">
          Boosted trade-in rates are live — {rates.cashPercent}% cash / {rates.creditPercent}% store credit of market
          price!
        </p>
        {countdown && <p className="text-sm text-white/85">Ends in {countdown}</p>}
      </div>
      {showSellLink && (
        <Link
          to={`/s/${slug}/sell`}
          className="shrink-0 rounded-btn bg-white/15 px-4 py-2 text-sm font-bold text-white transition-colors hover:bg-white/25"
        >
          Sell your cards
        </Link>
      )}
    </div>
  )
}

export default TradePromoBanner
