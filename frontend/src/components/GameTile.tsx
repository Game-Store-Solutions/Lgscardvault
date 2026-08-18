import { useState } from 'react'
import type { CatalogGameShowcase } from '../api/types'
import { gameTile } from '../lib/gameTiles'

/**
 * One "games we support" tile: catalog card art in a card-proportioned frame
 * with the game name on its own surface beneath.
 *
 * Catalog art comes from external CDNs (Scryfall, TCGCSV) where a given
 * rendition can 404 — and a bare <img> would leave the browser's broken-image
 * icon, which a marketing tile must never show. Each failure advances to the
 * next candidate URL; once they're exhausted the accent monogram takes over.
 */
export function GameTile({ game }: { game: CatalogGameShowcase }) {
  const [attempt, setAttempt] = useState(0)
  const tile = gameTile(game.code, game.name)
  // Tolerate an older API response that has not been restarted yet.
  const src = (game.imageUrls ?? [])[attempt]

  return (
    <figure className="group flex h-full flex-col overflow-hidden rounded-card border border-border bg-surface shadow-card transition-colors hover:border-fg/15 dark:border-white/10 dark:bg-white/[0.03] dark:hover:border-white/20">
      <span aria-hidden className="h-1 w-full shrink-0" style={{ backgroundColor: tile.accent }} />

      {/* Art frame at card proportions so nothing important gets cropped. */}
      <div
        className="relative overflow-hidden"
        style={{
          aspectRatio: '0.72',
          background: `radial-gradient(120% 80% at 50% 0%, ${tile.accent}26 0%, transparent 70%)`,
        }}
      >
        {src ? (
          <img
            // Keyed by src so React remounts (and retries) on the next URL.
            key={src}
            src={src}
            alt={`${game.name} card`}
            loading="lazy"
            decoding="async"
            onError={() => setAttempt((current) => current + 1)}
            className="absolute inset-0 size-full object-cover object-top transition-transform duration-[700ms] ease-out group-hover:scale-[1.04]"
          />
        ) : (
          <div className="absolute inset-0 grid place-items-center">
            <span
              aria-hidden
              className="font-display text-4xl font-black tracking-[-0.06em] opacity-70"
              style={{ color: tile.accent }}
            >
              {tile.short.slice(0, 2).toUpperCase()}
            </span>
          </div>
        )}
      </div>

      <figcaption className="flex flex-1 flex-col justify-center border-t border-border px-3 py-3 dark:border-white/10">
        <span className="block font-display text-sm font-extrabold leading-tight tracking-[-0.03em] text-fg sm:text-base">
          {tile.short}
        </span>
        <span className="mt-1 line-clamp-2 block text-[0.68rem] font-semibold uppercase leading-tight tracking-[0.12em] text-fg-muted">
          {game.name}
        </span>
      </figcaption>
    </figure>
  )
}

export default GameTile
