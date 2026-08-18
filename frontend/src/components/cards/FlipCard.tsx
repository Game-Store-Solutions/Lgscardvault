import { useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import { ImageOff } from 'lucide-react'
import { cx } from '../../lib/cx'
import { FoilOverlays } from './FoilOverlays'

const prefersReducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches

export interface FlipCardProps {
  /** Front-face art. */
  frontImage?: string
  /**
   * Back-face art. When present the card is treated as physically two-sided
   * (transform / modal_dfc / …) and flips over around the Y axis. When absent
   * the card is rotated in-plane by `rotateDeg` instead (flip / split layouts).
   */
  backImage?: string
  /** In-plane rotation (deg) for single-image rotate cards: 180 = flip, 90 = split. */
  rotateDeg?: number
  /** Whether the "other side" is currently showing (controlled). */
  flipped: boolean
  /** Toggle handler — fired by a full drag or a tap. */
  onToggle: () => void
  alt: string
  /** Adds the holographic foil sheen overlay. */
  foil?: boolean
  /** Rarity accent used for the border. */
  accent?: string
  /** Hide face frame on product details and similar layouts. */
  borderless?: boolean
  className?: string
}

/** Distance (in "settle-degrees") a drag must cover before it flips on release. */
const FLIP_THRESHOLD = 0.5

function Face({
  image,
  alt,
  foil,
  accent,
  flipped,
  borderless,
}: {
  image?: string
  alt: string
  foil: boolean
  accent: string
  flipped?: boolean
  borderless?: boolean
}) {
  return (
    <div
      className={cx(
        'tilt-card absolute inset-0 overflow-hidden rounded-[4.5%/3.5%]',
        !borderless && 'rounded-2xl border-2',
        foil && 'foil-card foil-idle-orbit',
      )}
      style={{
        ...(borderless ? {} : { borderColor: accent }),
        backfaceVisibility: 'hidden',
        transform: flipped ? 'rotateY(180deg)' : undefined,
      }}
    >
      {image ? (
        <img src={image} alt={alt} className="block size-full select-none object-cover" draggable={false} />
      ) : (
        <div className="grid size-full place-items-center bg-surface text-fg-muted">
          <ImageOff aria-hidden className="size-8" />
        </div>
      )}
      {image && <FoilOverlays foil={foil} />}
    </div>
  )
}

/**
 * FlipCard — an interactive card face you can flip with a press-and-slide drag
 * (or a tap / external button). Two-sided cards (a `backImage` is supplied) turn
 * over around the Y axis to reveal the reverse; single-image "rotate" cards
 * (`rotateDeg` supplied) spin in-plane — 180° for flip cards, 90° for split.
 */
export function FlipCard({ frontImage, backImage, rotateDeg = 180, flipped, onToggle, alt, foil = false, accent = '#6d5efc', borderless = false, className }: FlipCardProps) {
  const ref = useRef<HTMLDivElement>(null)
  const twoSided = Boolean(backImage)
  const settled = twoSided ? 180 : rotateDeg

  // Live drag state: progress is 0..1 of a full turn toward the other side.
  const [progress, setProgress] = useState(0)
  const [dragging, setDragging] = useState(false)
  const start = useRef<{ x: number; moved: boolean } | null>(null)

  function onPointerDown(e: ReactPointerEvent<HTMLDivElement>) {
    if (prefersReducedMotion()) return
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    start.current = { x: e.clientX, moved: false }
    setDragging(true)
  }

  function onPointerMove(e: ReactPointerEvent<HTMLDivElement>) {
    if (!start.current) return
    const el = ref.current
    if (!el) return
    const dx = e.clientX - start.current.x
    if (Math.abs(dx) > 4) start.current.moved = true
    // Half the card width of travel == a full flip to the other side.
    const next = Math.max(-1, Math.min(1, dx / (el.getBoundingClientRect().width * 0.5)))
    setProgress(next)
  }

  function endDrag(e: ReactPointerEvent<HTMLDivElement>) {
    if (!start.current) return
    const el = e.currentTarget as HTMLElement
    if (el.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId)
    const { moved } = start.current
    const shouldFlip = Math.abs(progress) >= FLIP_THRESHOLD
    start.current = null
    setDragging(false)
    setProgress(0)
    // A real slide past the threshold, or a plain tap, flips to the other side.
    if (shouldFlip || !moved) onToggle()
  }

  // Base rotation for the settled side, plus the live drag offset.
  const base = flipped ? settled : 0
  const dragOffset = progress * settled
  const angle = base + dragOffset
  const axis = twoSided ? 'rotateY' : 'rotateZ'

  return (
    <div ref={ref} className={cx('aspect-[5/7]', className)} style={{ perspective: '1200px' }}>
      <div
        className={cx(
          'relative size-full cursor-grab touch-none select-none',
          dragging ? 'cursor-grabbing' : 'transition-transform duration-500 ease-out',
        )}
        style={{ transformStyle: 'preserve-3d', transform: `${axis}(${angle}deg)` }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
        {twoSided ? (
          <>
            <Face image={frontImage} alt={alt} foil={foil} accent={accent} borderless={borderless} />
            <Face image={backImage} alt={alt} foil={foil} accent={accent} flipped borderless={borderless} />
          </>
        ) : (
          <Face image={frontImage} alt={alt} foil={foil} accent={accent} borderless={borderless} />
        )}
      </div>
    </div>
  )
}

export default FlipCard
