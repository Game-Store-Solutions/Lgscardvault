import { cardImage } from '../../../api/client'
import type { InventoryItem } from '../../../api/types'

export interface HeroCardImage {
  imageUrl: string
  name: string
  isFoil?: boolean
}

/** Last-resort art when the store has too little stock with images (or a URL 404s). */
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

function pushInventoryArt(
  pool: HeroCardImage[],
  seen: Set<string>,
  items: InventoryItem[],
  count: number,
  shuffle: boolean,
) {
  const list = items.filter((item) => item.quantity > 0)
  if (shuffle) {
    list.sort(() => Math.random() - 0.5)
  }
  for (const item of list) {
    if (pool.length >= count) return
    const url = cardImage(item.card)
    if (!url || seen.has(url)) continue
    seen.add(url)
    pool.push({
      imageUrl: url,
      name: item.card.name ?? 'Card',
      isFoil: item.isFoil,
    })
  }
}

/**
 * Hero art pool: spotlight first, then other in-stock store cards (staples /
 * high-value fillers), then generic MTG art only if the store still cannot fill.
 */
export function buildHeroCardPool(
  preferred: InventoryItem[],
  count = 20,
  filler: InventoryItem[] = [],
): HeroCardImage[] {
  const seen = new Set<string>()
  const pool: HeroCardImage[] = []

  // Keep spotlight order (price-desc from the API) so featured cards lead.
  pushInventoryArt(pool, seen, preferred, count, false)
  // Fill gaps from the rest of stock; shuffle so the marquee feels varied.
  pushInventoryArt(pool, seen, filler, count, true)

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
