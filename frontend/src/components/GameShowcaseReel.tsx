import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import type { CatalogGameShowcase, CatalogShowcaseCard } from '../api/types'
import { gameTile } from '../lib/gameTiles'
import { cx } from '../lib/cx'
import { EASE_PREMIUM } from './motion'
import { FlipWords } from './FlipWords'

const HOLD_MS = 2100
const CARDS_PER_GAME = 4

const REST_TILT = [-1.6, 1.2, -0.9, 1.8] as const

/** Names the reel should lead with when they exist in that game's pool. */
const REEL_LEADERS: Record<string, string[]> = {
  mtg: ['Birds of Paradise', 'Goblin Guide', 'Dark Confidant', 'Snapcaster Mage'],
}

/** Never show these in the games reel, even as art-failure backups. */
const REEL_BLOCKED: Record<string, string[]> = {
  mtg: ['Sol Ring', 'Black Lotus'],
}

function nameMatches(cardName: string, wanted: string): boolean {
  const name = cardName.trim().toLowerCase()
  const needle = wanted.trim().toLowerCase()
  return name === needle || name.startsWith(`${needle} `) || name.startsWith(`${needle},`) || name.startsWith(`${needle} //`)
}

function preferLeaders(pool: CatalogShowcaseCard[], leaders?: string[]): CatalogShowcaseCard[] {
  if (!leaders || leaders.length === 0) return pool
  const remaining = [...pool]
  const ordered: CatalogShowcaseCard[] = []
  for (const leader of leaders) {
    const index = remaining.findIndex((card) => nameMatches(card.name, leader))
    if (index >= 0) ordered.push(...remaining.splice(index, 1))
  }
  return [...ordered, ...remaining]
}

function isBlocked(card: CatalogShowcaseCard, gameCode: string): boolean {
  return (REEL_BLOCKED[gameCode] ?? []).some((name) => nameMatches(card.name, name))
}

function groupCards(
  games: CatalogGameShowcase[],
  cards: CatalogShowcaseCard[],
): { game: CatalogGameShowcase; pool: CatalogShowcaseCard[] }[] {
  const byCode = new Map<string, CatalogShowcaseCard[]>()
  for (const card of cards) {
    const list = byCode.get(card.gameCode) ?? []
    list.push(card)
    byCode.set(card.gameCode, list)
  }

  return games
    .map((game) => ({ game, pool: byCode.get(game.code) ?? [] }))
    .filter((entry) => entry.pool.length > 0)
}

function expandArtUrls(urls: string[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  const add = (url: string) => {
    if (!url || seen.has(url)) return
    seen.add(url)
    out.push(url)
  }

  for (const url of urls) {
    add(url.replace(/cards\.scryfall\.io\/(?:small|normal)\//, 'cards.scryfall.io/large/'))
    add(url.replace(/_400w\.jpg$/i, '_in_1000x1000.jpg'))
    add(url.replace(/cards\.scryfall\.io\/small\//, 'cards.scryfall.io/normal/'))
    add(url)
    add(url.replace(/_in_1000x1000\.jpg$/i, '_400w.jpg'))
    add(url.replace(/cards\.scryfall\.io\/(?:large|normal)\//, 'cards.scryfall.io/small/'))
  }

  return out
}

function artUrls(card: CatalogShowcaseCard): string[] {
  const urls = card.imageUrls?.filter(Boolean) ?? []
  return expandArtUrls(urls.length > 0 ? urls : card.imageUrl ? [card.imageUrl] : [])
}

/** Working art URL per card, filled by the page-load warmer so the reel
 *  does not wait until the section is scrolled into view. */
const warmedArt = new Map<string, string>()

function loadUrl(url: string): Promise<boolean> {
  return new Promise((resolve) => {
    const img = new Image()
    img.decoding = 'async'
    img.onload = () => resolve(true)
    img.onerror = () => resolve(false)
    img.src = url
  })
}

async function warmCard(card: CatalogShowcaseCard): Promise<string | null> {
  const cached = warmedArt.get(card.id)
  if (cached) return cached
  for (const url of artUrls(card)) {
    if (await loadUrl(url)) {
      warmedArt.set(card.id, url)
      return url
    }
  }
  return null
}

/** Kick off reel art downloads as soon as the catalog payload arrives, so the
 *  images are in cache before the games section is scrolled into view. */
export function warmupShowcaseCards(cards: CatalogShowcaseCard[]) {
  const byCode = new Map<string, CatalogShowcaseCard[]>()
  for (const card of cards) {
    const list = byCode.get(card.gameCode) ?? []
    list.push(card)
    byCode.set(card.gameCode, list)
  }
  for (const [code, pool] of byCode) {
    for (const card of pickVisible(pool, new Set(), code)) {
      void warmCard(card)
    }
  }
}

function urlsForCard(card: CatalogShowcaseCard): string[] {
  const expanded = artUrls(card)
  const warmed = warmedArt.get(card.id)
  if (!warmed) return expanded
  return [warmed, ...expanded.filter((url) => url !== warmed)]
}

function pickVisible(
  pool: CatalogShowcaseCard[],
  failedIds: Set<string>,
  gameCode: string,
): CatalogShowcaseCard[] {
  const available = pool.filter((card) => !failedIds.has(card.id) && !isBlocked(card, gameCode))
  return preferLeaders(available, REEL_LEADERS[gameCode]).slice(0, CARDS_PER_GAME)
}

function ShowcaseArt({
  card,
  accent,
  onFailed,
  artTick,
}: {
  card: CatalogShowcaseCard
  accent: string
  onFailed: (id: string) => void
  artTick: number
}) {
  const urls = useMemo(() => urlsForCard(card), [card, artTick])
  const [attempt, setAttempt] = useState(0)
  const src = urls[attempt]
  const reported = useRef(false)

  useEffect(() => {
    setAttempt(0)
    reported.current = false
  }, [card.id, artTick])

  useEffect(() => {
    if (src || reported.current) return
    reported.current = true
    onFailed(card.id)
  }, [src, card.id, onFailed])

  return (
    <div
      className="relative overflow-hidden rounded-[1.1rem] border border-border bg-surface shadow-card dark:border-white/10 dark:bg-white/[0.03]"
      style={{ aspectRatio: '0.72' }}
    >
      <span aria-hidden className="absolute inset-x-0 top-0 z-10 h-0.5" style={{ backgroundColor: accent }} />
      <div
        aria-hidden
        className="absolute inset-0"
        style={{ background: `radial-gradient(120% 80% at 50% 0%, ${accent}26 0%, transparent 70%)` }}
      />
      {src ? (
        <img
          key={src}
          src={src}
          alt={card.name}
          onError={() => setAttempt((current) => current + 1)}
          className="absolute inset-0 size-full object-cover object-top"
          loading="eager"
          fetchPriority="high"
          decoding="async"
        />
      ) : null}
    </div>
  )
}

/**
 * Landing "games we support" reel: the game name flips, then four signature
 * cards from that game slide into a row. Catalog art only — no hardcoded URLs.
 * If a printing's art 404s, the next card from that game's catalogue pool
 * takes its place rather than a monogram placeholder.
 */
export function GameShowcaseReel({
  games,
  cards,
}: {
  games: CatalogGameShowcase[]
  cards: CatalogShowcaseCard[]
}) {
  const slides = useMemo(() => groupCards(games, cards), [games, cards])
  const [index, setIndex] = useState(0)
  const [failedIds, setFailedIds] = useState<Set<string>>(() => new Set())
  const [artTick, setArtTick] = useState(0)
  const holdUntil = useRef(0)

  const markFailed = useCallback((id: string) => {
    setFailedIds((current) => {
      if (current.has(id)) return current
      const next = new Set(current)
      next.add(id)
      return next
    })
  }, [])

  useEffect(() => {
    if (slides.length === 0) return
    let cancelled = false
    const emptyFailed = new Set<string>()
    const first = pickVisible(slides[0].pool, emptyFailed, slides[0].game.code)
    const rest = slides.slice(1).flatMap((slide) => pickVisible(slide.pool, emptyFailed, slide.game.code))

    const bump = () => {
      if (!cancelled) setArtTick((current) => current + 1)
    }

    const failIfMissing = (card: CatalogShowcaseCard, src: string | null) => {
      if (!src && !cancelled) markFailed(card.id)
    }

    void (async () => {
      await Promise.all(first.map((card) => warmCard(card).then((src) => failIfMissing(card, src))))
      bump()
      if (cancelled || rest.length === 0) return
      await Promise.all(rest.map((card) => warmCard(card).then((src) => failIfMissing(card, src))))
      bump()
    })()

    return () => {
      cancelled = true
    }
  }, [slides, markFailed])

  useEffect(() => {
    if (slides.length <= 1) return
    holdUntil.current = performance.now() + HOLD_MS
    let frame = 0
    const tick = (now: number) => {
      if (now >= holdUntil.current) {
        setIndex((current) => (current + 1) % slides.length)
        holdUntil.current = now + HOLD_MS
      }
      frame = window.requestAnimationFrame(tick)
    }
    frame = window.requestAnimationFrame(tick)
    return () => window.cancelAnimationFrame(frame)
  }, [slides.length])

  useEffect(() => {
    if (index >= slides.length && slides.length > 0) setIndex(0)
  }, [index, slides.length])

  if (slides.length === 0) return null

  const active = slides[Math.min(index, slides.length - 1)]
  const tile = gameTile(active.game.code, active.game.name)
  const names = slides.map((slide) => gameTile(slide.game.code, slide.game.name).short)
  const visible = pickVisible(active.pool, failedIds, active.game.code)

  return (
    <div className="relative isolate mt-8">
      <div
        aria-hidden
        className="pointer-events-none absolute -inset-x-6 -top-10 -bottom-8 -z-10 sm:-inset-x-16 sm:-top-14 sm:-bottom-12"
      >
        <span className="absolute left-1/2 top-[18%] h-40 w-[min(28rem,80%)] -translate-x-1/2 rounded-full bg-[radial-gradient(ellipse_at_center,rgba(198,160,53,0.30),transparent_72%)] blur-3xl dark:bg-[radial-gradient(ellipse_at_center,rgba(220,38,38,0.38),transparent_72%)]" />
        <span className="absolute left-1/2 top-[62%] h-[22rem] w-[min(56rem,120%)] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(ellipse_at_center,rgba(10,22,39,0.12),transparent_70%)] blur-3xl dark:bg-[radial-gradient(ellipse_at_center,rgba(220,38,38,0.26),transparent_70%)]" />
      </div>

      <h2
        className="text-display-sm sm:text-display-md"
        aria-label={`We stock ${tile.short}`}
        aria-live="polite"
        aria-atomic="true"
      >
        We stock <FlipWords word={tile.short} color={tile.accent} />
      </h2>
      <p className="mt-3 max-w-2xl text-sm leading-7 text-fg-muted">
        Singles and sealed product across the games players actually play, all searchable by set, rarity,
        condition, and finish.
      </p>

      <div className="relative mt-8">
        <div className="invisible grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-5" aria-hidden>
          {Array.from({ length: Math.max(visible.length, 1) }, (_, slot) => (
            <figure key={slot}>
              <div className="rounded-[1.1rem]" style={{ aspectRatio: '0.72' }} />
              <figcaption className="mt-2 text-[0.7rem]">&nbsp;</figcaption>
            </figure>
          ))}
        </div>
        <AnimatePresence initial={false}>
          <motion.div
            key={active.game.code}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.4, ease: EASE_PREMIUM }}
            className="absolute inset-0 grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-5"
          >
            {visible.map((card, cardIndex) => (
              <motion.figure
                key={card.id}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0, rotate: REST_TILT[cardIndex] ?? 0 }}
                transition={{ duration: 0.4, delay: cardIndex * 0.03, ease: EASE_PREMIUM }}
                className="origin-bottom will-change-transform"
              >
                <ShowcaseArt card={card} accent={tile.accent} onFailed={markFailed} artTick={artTick} />
                <figcaption className="mt-2 truncate px-0.5 text-center text-[0.7rem] font-semibold text-fg-muted">
                  {card.name}
                </figcaption>
              </motion.figure>
            ))}
          </motion.div>
        </AnimatePresence>
      </div>

      {slides.length > 1 && (
        <div className="mt-6 flex flex-wrap items-center justify-center gap-2" role="tablist" aria-label="Supported games">
          {slides.map((slide, slideIndex) => {
            const label = names[slideIndex]
            const selected = slideIndex === index
            const accent = gameTile(slide.game.code, slide.game.name).accent
            return (
              <button
                key={slide.game.code}
                type="button"
                role="tab"
                aria-selected={selected}
                aria-label={label}
                onClick={() => {
                  setIndex(slideIndex)
                  holdUntil.current = performance.now() + HOLD_MS
                }}
                className={cx(
                  'rounded-full px-3 py-1.5 text-xs font-bold tracking-wide transition-colors',
                  selected
                    ? 'text-white'
                    : 'bg-surface text-fg-muted ring-1 ring-border hover:text-fg dark:bg-white/[0.04] dark:ring-white/10',
                )}
                style={selected ? { backgroundColor: accent } : undefined}
              >
                {label}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

export default GameShowcaseReel
