import { useState, type ReactNode } from 'react'
import { Loader2 } from 'lucide-react'
import { motion } from 'framer-motion'
import { cardImage } from '../../api/client'
import { useTilt } from '../../hooks'
import { cx } from '../../lib/cx'
import { CardImage } from './CardImage'
import { FoilOverlays } from './FoilOverlays'

/**
 * Lossless card art with the holographic foil overlay. Holds a spinner in the
 * frame until the image is in, then reveals art + foil together.
 */
export function HqFoilCardArt({
  card,
  foil = false,
  priority = false,
  fit = 'cover',
  frameClassName,
  children,
}: {
  card: {
    name: string
    imageUrl?: string
    imageUris?: { png?: string; large?: string; normal?: string; small?: string }
    cardFaces?: { imageUrl?: string; imageUris?: { png?: string; large?: string; normal?: string; small?: string } }[]
  }
  foil?: boolean
  priority?: boolean
  fit?: 'cover' | 'contain'
  frameClassName?: string
  children?: ReactNode
}) {
  const image = cardImage(card, { quality: 'full' })
  const [artReady, setArtReady] = useState(!image)
  const { ref, onPointerEnter, onPointerMove, onPointerLeave, tiltStyle } = useTilt(9, {
    idle: Boolean(foil && artReady),
  })

  return (
    <div
      ref={ref}
      onPointerEnter={onPointerEnter}
      onPointerMove={onPointerMove}
      onPointerLeave={onPointerLeave}
      className="perspective-[900px]"
    >
      <motion.div
        className={cx(
          'tilt-card relative aspect-[5/7] overflow-hidden bg-surface-elevated dark:bg-[#18181B]',
          foil && artReady && 'foil-card',
          frameClassName,
        )}
        style={tiltStyle}
      >
        {!artReady && (
          <span
            className="absolute inset-0 z-10 grid place-items-center bg-surface-elevated"
            aria-busy="true"
            aria-label={`Loading ${card.name}`}
          >
            <Loader2 aria-hidden className="size-6 animate-spin text-brand-600" />
          </span>
        )}
        <CardImage
          src={image}
          alt={card.name}
          fit={fit}
          className={cx('h-full w-full', !artReady && 'opacity-0')}
          label={card.name}
          priority={priority}
          onLoad={() => setArtReady(true)}
          onError={() => setArtReady(true)}
        />
        {artReady && image && <FoilOverlays foil={foil} />}
        {artReady ? children : null}
      </motion.div>
    </div>
  )
}
