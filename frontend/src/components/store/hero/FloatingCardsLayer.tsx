import { useMemo, useState, type CSSProperties } from 'react'
import { cardArtDelivery } from '../../../api/client'
import { cx } from '../../../lib/cx'
import { GENERIC_MTG_CARDS, type HeroCardImage } from './heroCardPool'
import { FoilOverlays } from '../../cards/FoilOverlays'

/** Try higher/lower Scryfall sizes when the primary URL 404s. */
function heroArtCandidates(imageUrl: string): string[] {
  const base = imageUrl.split('#')[0] ?? imageUrl
  const seen = new Set<string>()
  const out: string[] = []
  const add = (url: string) => {
    if (!url || seen.has(url)) return
    seen.add(url)
    out.push(url)
  }
  add(base)
  add(base.replace(/cards\.scryfall\.io\/(?:small|normal)\//, 'cards.scryfall.io/large/'))
  add(base.replace(/cards\.scryfall\.io\/(?:large|small)\//, 'cards.scryfall.io/normal/'))
  add(base.replace(/cards\.scryfall\.io\/(?:large|normal)\//, 'cards.scryfall.io/small/'))
  return out
}

function HeroCardImg({
  card,
  className,
  style,
  fallbackIndex = 0,
}: {
  card: HeroCardImage
  className?: string
  style?: CSSProperties
  /** Which staple to use if every candidate URL fails. */
  fallbackIndex?: number
}) {
  const primaryCandidates = useMemo(() => heroArtCandidates(card.imageUrl), [card.imageUrl])
  const fallback = GENERIC_MTG_CARDS[fallbackIndex % GENERIC_MTG_CARDS.length]!
  const fallbackCandidates = useMemo(
    () => heroArtCandidates(fallback.imageUrl),
    [fallback.imageUrl],
  )

  const [phase, setPhase] = useState<'primary' | 'fallback'>('primary')
  const [candidateIndex, setCandidateIndex] = useState(0)
  const [exhausted, setExhausted] = useState(false)

  const candidates = phase === 'primary' ? primaryCandidates : fallbackCandidates
  const activeUrl = exhausted
    ? GENERIC_MTG_CARDS[0]!.imageUrl
    : candidates[Math.min(candidateIndex, Math.max(candidates.length - 1, 0))]
  const showFoil = !exhausted && (phase === 'primary' ? Boolean(card.isFoil) : Boolean(fallback.isFoil))
  const delivery = useMemo(() => (activeUrl ? cardArtDelivery(activeUrl) : null), [activeUrl])

  const onError = () => {
    if (exhausted) return
    if (candidateIndex + 1 < candidates.length) {
      setCandidateIndex((i) => i + 1)
      return
    }
    if (phase === 'primary') {
      setPhase('fallback')
      setCandidateIndex(0)
      return
    }
    setExhausted(true)
  }

  return (
    <span
      className={cx(
        'relative block overflow-hidden rounded-md shadow-lg ring-1 ring-black/20',
        showFoil && 'foil-card',
        className,
      )}
      style={style}
      aria-hidden
    >
      {delivery ? (
        <img
          key={`${phase}-${delivery.src}`}
          src={delivery.src}
          srcSet={delivery.srcSet}
          alt=""
          draggable={false}
          decoding="async"
          className="size-full rounded-md object-cover"
          onError={onError}
        />
      ) : null}
      {showFoil && <FoilOverlays foil glare={false} />}
    </span>
  )
}

/** Slow-drifting card field with optional pointer parallax. */
export function FloatingCardsLayer({
  cards,
  className,
  count = 20,
}: {
  cards: HeroCardImage[]
  className?: string
  count?: number
}) {
  const [parallax, setParallax] = useState({ x: 0, y: 0 })
  const pool = useMemo(() => {
    const source = cards.length > 0 ? cards : GENERIC_MTG_CARDS
    const list = [...source.slice(0, count)]
    while (list.length < count) {
      list.push(source[list.length % source.length]!)
    }
    return list.slice(0, count)
  }, [cards, count])

  const slots = useMemo(
    () =>
      pool.map((card, index) => {
        const column = index % 5
        const row = Math.floor(index / 5)
        return {
          card,
          left: 4 + column * 19 + (index % 3) * 2,
          top: 6 + row * 22 + (index % 4) * 1.5,
          delay: (index % 8) * 0.7,
          duration: 14 + (index % 6) * 2,
          rotate: -18 + (index % 12) * 3,
          scale: 0.55 + (index % 5) * 0.08,
          depth: index % 3,
        }
      }),
    [pool],
  )

  return (
    <div
      className={cx('pointer-events-none absolute inset-0 overflow-hidden', className)}
      onMouseMove={(e) => {
        const rect = e.currentTarget.getBoundingClientRect()
        const x = ((e.clientX - rect.left) / rect.width - 0.5) * 12
        const y = ((e.clientY - rect.top) / rect.height - 0.5) * 8
        setParallax({ x, y })
      }}
      onMouseLeave={() => setParallax({ x: 0, y: 0 })}
    >
      {slots.map((slot, i) => (
        <div
          key={`${slot.card.imageUrl}-${i}`}
          className="hero-float-card absolute w-[min(22vw,7.5rem)] motion-safe:animate-[hero-float_ease-in-out_infinite]"
          style={
            {
              left: `${slot.left}%`,
              top: `${slot.top}%`,
              animationDuration: `${slot.duration}s`,
              animationDelay: `${slot.delay}s`,
              transform: `translate(${parallax.x * (slot.depth + 1) * 0.15}px, ${parallax.y * (slot.depth + 1) * 0.15}px) rotate(${slot.rotate}deg) scale(${slot.scale})`,
              zIndex: slot.depth,
              opacity: 0.35 + slot.depth * 0.12,
            } as CSSProperties
          }
        >
          <HeroCardImg card={slot.card} fallbackIndex={i + 3} className="aspect-[5/7] w-full" />
        </div>
      ))}
    </div>
  )
}

export { HeroCardImg }
