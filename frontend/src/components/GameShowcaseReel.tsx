import { useEffect, useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import type { CatalogGameShowcase, CatalogShowcaseCard } from '../api/types'
import { gameTile } from '../lib/gameTiles'
import { cx } from '../lib/cx'
import { EASE_PREMIUM } from './motion'
import { FlipWords } from './FlipWords'

const HOLD_MS = 4200
const CARDS_PER_GAME = 4

const REST_TILT = [-2.4, 1.8, -1.4, 2.6] as const

function groupCards(
  games: CatalogGameShowcase[],
  cards: CatalogShowcaseCard[],
): { game: CatalogGameShowcase; cards: CatalogShowcaseCard[] }[] {
  const byCode = new Map<string, CatalogShowcaseCard[]>()
  for (const card of cards) {
    const list = byCode.get(card.gameCode) ?? []
    if (list.length < CARDS_PER_GAME) list.push(card)
    byCode.set(card.gameCode, list)
  }

  return games
    .map((game) => ({ game, cards: byCode.get(game.code) ?? [] }))
    .filter((entry) => entry.cards.length > 0)
}

function ShowcaseArt({ src, alt, accent }: { src: string; alt: string; accent: string }) {
  const [failed, setFailed] = useState(false)

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
      {src && !failed ? (
        <img
          src={src}
          alt={alt}
          onError={() => setFailed(true)}
          className="absolute inset-0 size-full object-cover object-top"
          loading="lazy"
          decoding="async"
        />
      ) : (
        <div className="absolute inset-0 grid place-items-center">
          <span aria-hidden className="font-display text-4xl font-black tracking-[-0.06em] opacity-70" style={{ color: accent }}>
            {alt.slice(0, 2).toUpperCase()}
          </span>
        </div>
      )}
    </div>
  )
}

/**
 * Landing "games we support" reel: the game name flips, then four signature
 * cards from that game slide into a row. Catalog art only — no hardcoded URLs.
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
  const [paused, setPaused] = useState(false)

  useEffect(() => {
    if (slides.length <= 1 || paused) return
    const timer = window.setInterval(() => {
      setIndex((current) => (current + 1) % slides.length)
    }, HOLD_MS)
    return () => window.clearInterval(timer)
  }, [slides.length, paused])

  useEffect(() => {
    if (index >= slides.length && slides.length > 0) setIndex(0)
  }, [index, slides.length])

  if (slides.length === 0) return null

  const active = slides[Math.min(index, slides.length - 1)]
  const tile = gameTile(active.game.code, active.game.name)
  const names = slides.map((slide) => gameTile(slide.game.code, slide.game.name).short)

  return (
    <div
      className="mt-8"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      <h2 className="text-display-sm sm:text-display-md">
        We stock{' '}
        <span className="sr-only">{tile.short}.</span>
          <FlipWords word={tile.short} reserve={names} className="text-brand-600 dark:text-brand-400" />
        <span aria-hidden>.</span>
      </h2>
      <p className="mt-3 max-w-2xl text-sm leading-7 text-fg-muted">
        Singles and sealed product across the games collectors actually play, all searchable by set, rarity,
        condition, and finish.
      </p>

      <div className="relative mt-8 min-h-[14rem] sm:min-h-[18rem]">
        <AnimatePresence mode="wait">
          <motion.div
            key={active.game.code}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, transition: { duration: 0.2 } }}
            className="grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-5"
          >
            {active.cards.slice(0, CARDS_PER_GAME).map((card, cardIndex) => (
              <motion.figure
                key={card.id}
                initial={{ opacity: 0, y: 28, rotate: cardIndex % 2 === 0 ? -8 : 8, scale: 0.94 }}
                animate={{ opacity: 1, y: 0, rotate: REST_TILT[cardIndex] ?? 0, scale: 1 }}
                exit={{ opacity: 0, y: -18, filter: 'blur(6px)', scale: 0.96 }}
                transition={{ duration: 0.48, delay: cardIndex * 0.07, ease: EASE_PREMIUM }}
                className="origin-bottom"
              >
                <ShowcaseArt
                  src={card.imageUrl ?? ''}
                  alt={card.name}
                  accent={tile.accent}
                />
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
            return (
              <button
                key={slide.game.code}
                type="button"
                role="tab"
                aria-selected={selected}
                aria-label={label}
                onClick={() => setIndex(slideIndex)}
                className={cx(
                  'rounded-full px-3 py-1.5 text-xs font-bold tracking-wide transition-colors',
                  selected
                    ? 'bg-brand-500 text-white'
                    : 'bg-surface text-fg-muted ring-1 ring-border hover:text-fg dark:bg-white/[0.04] dark:ring-white/10',
                )}
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
