import { ImageOff } from 'lucide-react'
import { motion } from 'framer-motion'
import { cx } from '../../lib/cx'
import { useTilt } from '../../hooks'
import { FoilOverlays } from './FoilOverlays'

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
 * (inspired by simeydotme/pokemon-cards-css). Moving the pointer springs the
 * card in 3D, drifts a glare highlight, and — for foil cards — locks a rainbow
 * holo + sparkle to the light. Foils keep a slow idle orbit when the pointer is
 * away. Falls back to a static image under reduced-motion.
 */
export function InteractiveCard({ image, alt, foil = false, accent = '#c6a035', maxTilt = 14, shadow = true, borderless = false, className }: InteractiveCardProps) {
  const { ref, onPointerEnter, onPointerMove, onPointerLeave, tiltStyle } = useTilt(maxTilt, { idle: foil })

  return (
    <div
      ref={ref}
      className={cx('[perspective:1000px]', className)}
      onPointerEnter={onPointerEnter}
      onPointerMove={onPointerMove}
      onPointerLeave={onPointerLeave}
    >
      <motion.div
        className={cx(
          'tilt-card relative overflow-hidden rounded-[4.5%/3.5%]',
          !borderless && 'rounded-2xl border-2',
          foil && 'foil-card',
          shadow && 'shadow-card',
        )}
        style={{
          ...tiltStyle,
          ...(borderless ? {} : { borderColor: accent }),
        }}
      >
        {image ? (
          <img src={image} alt={alt} loading="lazy" decoding="async" className="block w-full select-none" draggable={false} />
        ) : (
          <div className="grid aspect-[5/7] place-items-center bg-surface text-fg-muted">
            <ImageOff aria-hidden className="size-8" />
          </div>
        )}
        {image && <FoilOverlays foil={foil} />}
      </motion.div>
    </div>
  )
}

export default InteractiveCard
