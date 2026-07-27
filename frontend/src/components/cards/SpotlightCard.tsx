import { Link } from 'react-router'
import { cardImage, formatScryfallPrice } from '../../api/client'
import type { InventoryItem } from '../../api/types'
import { rarityAccent } from '../../lib/mtg'
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
        <span className="absolute right-2 top-2 z-20 rounded-full bg-brand-500 px-2 py-0.5 text-[0.65rem] font-bold uppercase tracking-wide text-white shadow">
          {ribbon}
        </span>
      )}
      <InteractiveCard
        image={cardImage(item.card)}
        alt={item.card.name}
        foil={item.isFoil}
        accent={rarityAccent(item.card.rarity)}
        maxTilt={12}
        shadow={false}
      />
      <div className="mt-2 px-0.5">
        <h3 className="truncate font-display text-sm font-bold tracking-tight text-fg group-hover:text-brand-600">
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
