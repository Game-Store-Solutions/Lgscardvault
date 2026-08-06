import { ImageOff } from 'lucide-react'
import { cx } from '../../lib/cx'
import { useTilt } from '../../hooks'

export interface InteractiveCardProps {
  image?: string
  alt: string
  /** Adds the holographic foil sheen overlay. */
  foil?: boolean
  /** Rarity accent used for the border. */
  accent?: string
  /** Max tilt in degrees. */
  maxTilt?: number
  /** Drop shadow under the card (default true). */
  shadow?: boolean
  /** Hide the rarity-colored frame (e.g. product details hero). */
  borderless?: boolean
  className?: string
}

/**
 * InteractiveCard — a pointer-driven holographic tilt for a card image
 * (inspired by simeydotme/pokemon-cards-css). Moving the pointer tilts the card
 * in 3D, drifts a glare highlight, and — for foil cards — sweeps a rainbow
 * holo sheen. Falls back to a static image under reduced-motion.
 */
export function InteractiveCard({ image, alt, foil = false, accent = '#6d5efc', maxTilt = 14, shadow = true, borderless = false, className }: InteractiveCardProps) {
  const { ref, onPointerMove, onPointerLeave } = useTilt(maxTilt)

  return (
    <div ref={ref} className={cx('[perspective:1000px]', className)} onPointerMove={onPointerMove} onPointerLeave={onPointerLeave}>
      <div
        className={cx(
          'tilt-card relative overflow-hidden rounded-[4.5%/3.5%]',
          !borderless && 'rounded-2xl border-2',
          foil && 'foil-card',
          shadow && 'shadow-card',
        )}
        style={borderless ? undefined : { borderColor: accent }}
      >
        {image ? (
          <img src={image} alt={alt} loading="lazy" decoding="async" className="block w-full select-none" draggable={false} />
        ) : (
          <div className="grid aspect-[5/7] place-items-center bg-surface text-fg-muted">
            <ImageOff aria-hidden className="size-8" />
          </div>
        )}
        {image && <div aria-hidden className="tilt-glare pointer-events-none absolute inset-0" />}
        {image && foil && <div aria-hidden className="tilt-holo pointer-events-none absolute inset-0" />}
      </div>
    </div>
  )
}

export default InteractiveCard
