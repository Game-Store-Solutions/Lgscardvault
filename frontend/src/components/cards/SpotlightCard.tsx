import { Link } from 'react-router'
import { motion } from 'framer-motion'
import { cardImage, formatScryfallPrice } from '../../api/client'
import type { InventoryItem } from '../../api/types'
import { rarityAccent } from '../../lib/mtg'
import { EASE_PREMIUM } from '../motion'
import { InteractiveCard } from './InteractiveCard'

export interface SpotlightCardProps {
  item: InventoryItem
  slug: string
  /** Optional corner ribbon label (e.g. "Featured"). */
  ribbon?: string
}

/**
 * SpotlightCard — displays a real card in the spotlight rail using the same
 * holographic InteractiveCard as the details page (3D tilt + glare, foil sheen),
 * with a compact name / set / price caption beneath.
 */
export function SpotlightCard({ item, slug, ribbon }: SpotlightCardProps) {
  const price = formatScryfallPrice(item.card, item.isFoil ? 'foil' : 'nonfoil')

  return (
    <Link to={`/s/${slug}/cards/${item.id}`} className="group relative w-40 flex-shrink-0 snap-start sm:w-52">
      {ribbon && (
        <span className="absolute right-3 top-3 z-20 rounded-full bg-brand-500 px-2.5 py-1 text-[0.65rem] font-bold uppercase tracking-wide text-white shadow">
          {ribbon}
        </span>
      )}
      <motion.div
        whileHover={{ y: -6 }}
        transition={{ duration: 0.24, ease: EASE_PREMIUM }}
        className="overflow-hidden rounded-card border border-border bg-surface p-2 shadow-card transition-colors group-hover:border-fg/15 dark:border-white/10 dark:bg-white/[0.03] dark:group-hover:border-white/20"
      >
        <InteractiveCard
          image={cardImage(item.card)}
          alt={item.card.name}
          foil={item.isFoil}
          accent={rarityAccent(item.card.rarity)}
          maxTilt={10}
          shadow={false}
        />
      </motion.div>
      <div className="mt-3 px-0.5">
        <h3 className="truncate font-display text-sm font-bold tracking-tight text-fg transition-colors group-hover:text-brand-600 dark:group-hover:text-white">
          {item.card.name}
        </h3>
        <div className="flex items-center justify-between text-xs">
          <span className="text-fg-muted">{item.card.setCode?.toUpperCase() ?? '—'}</span>
          <span className="font-bold text-fg">{price}</span>
        </div>
      </div>
    </Link>
  )
}

export default SpotlightCard
