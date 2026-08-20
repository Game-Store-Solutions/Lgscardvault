import { useEffect, useState } from 'react'
import { ImageOff } from 'lucide-react'
import { cx } from '../../lib/cx'

export interface CardImageProps {
  /** Image URL; a missing one renders the placeholder immediately. */
  src?: string | null
  alt: string
  /** Classes for the rendered image / placeholder box (sizing, rounding). */
  className?: string
  /** `cover` fills the frame (grids), `contain` fits it (sealed boxes). */
  fit?: 'cover' | 'contain'
  /** Hide the caption on thumbnails too small to read it. */
  showLabel?: boolean
  label?: string
  /** Load immediately instead of waiting for the browser's lazy heuristic. */
  priority?: boolean
  onLoad?: () => void
  onError?: () => void
}

/**
 * A card/product image that always renders something.
 *
 * Catalog art comes from external sources — TCGplayer via TCGCSV, Scryfall —
 * and a share of it is missing or 404s. Rendering a bare <img> in that case
 * leaves the browser's broken-image icon (or, if hidden, a hole where the art
 * should be) and the layout jumps. This falls back to a blank-card
 * placeholder that keeps the frame's size and reads as "no art", so a grid
 * of results stays aligned whatever the source does.
 */
export function CardImage({
  src,
  alt,
  className,
  fit = 'cover',
  showLabel = true,
  label = 'No image',
  priority = false,
  onLoad,
  onError,
}: CardImageProps) {
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    setFailed(false)
  }, [src])

  if (src && !failed) {
    return (
      <img
        src={src}
        alt={alt}
        loading={priority ? 'eager' : 'lazy'}
        fetchPriority={priority ? 'high' : 'auto'}
        decoding="async"
        ref={(node) => {
          if (node?.complete && node.naturalWidth > 0) {
            onLoad?.()
          }
        }}
        onLoad={onLoad}
        onError={() => {
          setFailed(true)
          onError?.()
        }}
        className={cx('block', 'cover' === fit ? 'object-cover' : 'object-contain', className)}
      />
    )
  }

  return (
    <span
      role="img"
      aria-label={`${alt}. Image not available`}
      // Deliberately light in both themes: this stands in for the card face
      // itself, and a blank card is white, not dark.
      className={cx(
        'flex flex-col items-center justify-center gap-1 overflow-hidden',
        'border border-slate-200 bg-white text-slate-400',
        className,
      )}
    >
      <ImageOff aria-hidden className="size-5 shrink-0" />
      {showLabel && (
        <span className="max-w-full truncate px-1 text-center text-[0.6rem] font-bold uppercase tracking-wide">
          {label}
        </span>
      )}
    </span>
  )
}

export default CardImage
