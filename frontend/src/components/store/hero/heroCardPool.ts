import { cardImage } from '../../../api/client'
import type { InventoryItem } from '../../../api/types'

export interface HeroCardImage {
  imageUrl: string
  name: string
  isFoil?: boolean
}

/** Staple singles when inventory has no card art yet (or a URL 404s). */
export const GENERIC_MTG_CARDS: HeroCardImage[] = [
  { name: 'Sol Ring', imageUrl: 'https://cards.scryfall.io/normal/front/9/1/91fdb56b-54d5-4272-8319-505ff987fe9b.jpg' },
  { name: 'Lightning Bolt', imageUrl: 'https://cards.scryfall.io/normal/front/7/6/7673784e-db4b-43a1-8d55-1bb9fc1e284f.jpg' },
  { name: 'Counterspell', imageUrl: 'https://cards.scryfall.io/normal/front/4/f/4f616706-ec97-4923-bb1e-11a69fbaa1f8.jpg' },
  { name: 'Rhystic Study', imageUrl: 'https://cards.scryfall.io/normal/front/9/f/9f37c5b6-a59c-45cd-9a99-e9357fe9ea1b.jpg' },
  { name: 'Smothering Tithe', imageUrl: 'https://cards.scryfall.io/normal/front/8/6/861b5889-0183-4bee-afeb-a4b2aa700a8e.jpg' },
  { name: 'Sol Ring', imageUrl: 'https://cards.scryfall.io/normal/front/1/9/1925f1b1-af24-43d7-bdca-4437f3b279a7.jpg', isFoil: true },
  { name: 'Lightning Bolt', imageUrl: 'https://cards.scryfall.io/normal/front/0/4/04d7fe16-24ba-4d35-9f32-8f417e8d2971.jpg' },
  { name: 'Counterspell', imageUrl: 'https://cards.scryfall.io/normal/front/4/f/4f616706-ec97-4923-bb1e-11a69fbaa1f8.jpg' },
  { name: 'Rhystic Study', imageUrl: 'https://cards.scryfall.io/normal/front/9/f/9f37c5b6-a59c-45cd-9a99-e9357fe9ea1b.jpg', isFoil: true },
  { name: 'Smothering Tithe', imageUrl: 'https://cards.scryfall.io/normal/front/8/6/861b5889-0183-4bee-afeb-a4b2aa700a8e.jpg' },
]

/** Prefer real inventory art; pad with generic staples to reach `count`. */
export function buildHeroCardPool(inventory: InventoryItem[], count = 20): HeroCardImage[] {
  const seen = new Set<string>()
  const pool: HeroCardImage[] = []

  const shuffled = [...inventory].filter((item) => item.quantity > 0).sort(() => Math.random() - 0.5)
  for (const item of shuffled) {
    const url = cardImage(item.card)
    if (!url || seen.has(url)) continue
    seen.add(url)
    pool.push({
      imageUrl: url,
      name: item.card.name ?? 'Card',
      isFoil: item.isFoil,
    })
    if (pool.length >= count) return pool
  }

  let genericIndex = 0
  while (pool.length < count) {
    const generic = GENERIC_MTG_CARDS[genericIndex % GENERIC_MTG_CARDS.length]!
    genericIndex += 1
    const uniqueUrl = seen.has(generic.imageUrl)
      ? `${generic.imageUrl}#pad-${pool.length}`
      : generic.imageUrl
    seen.add(generic.imageUrl)
    pool.push({ ...generic, imageUrl: uniqueUrl })
  }

  return pool.slice(0, count)
}

export function pickFeaturedCard(inventory: InventoryItem[]): HeroCardImage | null {
  const pool = buildHeroCardPool(inventory, 1)
  return pool[0] ?? null
}
