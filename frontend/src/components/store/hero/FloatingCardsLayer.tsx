import { useMemo, useState, type CSSProperties } from 'react'
import { cx } from '../../../lib/cx'
import type { HeroCardImage } from './heroCardPool'
import { FoilOverlays } from '../../cards/FoilOverlays'

function HeroCardImg({
  card,
  className,
  style,
}: {
  card: HeroCardImage
  className?: string
  style?: CSSProperties
}) {
  const [failed, setFailed] = useState(false)
  if (failed) {
    return (
      <div
        className={cx(
          'rounded-md bg-gradient-to-br from-slate-800 via-indigo-950 to-violet-900 shadow-lg ring-1 ring-white/10',
          className,
        )}
        style={style}
        aria-hidden
      />
    )
  }
  return (
    <span
      className={cx('relative block overflow-hidden rounded-md shadow-lg ring-1 ring-black/20', card.isFoil && 'foil-card', className)}
      style={style}
      aria-hidden
    >
      <img
        src={card.imageUrl.split('#')[0]}
        alt=""
        width={488}
        height={680}
        draggable={false}
        className="size-full rounded-md object-cover"
        onError={() => setFailed(true)}
      />
      {card.isFoil && <FoilOverlays foil glare={false} />}
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
    const list = [...cards.slice(0, count)]
    while (list.length < count && cards.length > 0) {
      list.push(cards[list.length % cards.length]!)
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
          <HeroCardImg card={slot.card} className="aspect-[5/7] w-full" />
        </div>
      ))}
    </div>
  )
}

export { HeroCardImg }
