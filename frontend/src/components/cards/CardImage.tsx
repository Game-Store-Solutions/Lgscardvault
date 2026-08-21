import { useMemo, useState } from 'react'
import { ImageOff } from 'lucide-react'
import { cardArtDelivery } from '../../api/client'
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
  /** Override lazy loading (e.g. above-the-fold hero). */
  loading?: 'lazy' | 'eager'
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
 *
 * Scryfall URLs paint with `normal` (1x) and advertise `large` (2x) so retina
 * screens get sharper art without forcing every 1x thumbnail to download it.
 */
export function CardImage({
  src,
  alt,
  className,
  fit = 'cover',
  showLabel = true,
  label = 'No image',
  loading = 'lazy',
}: CardImageProps) {
  const [failed, setFailed] = useState(false)
  const delivery = useMemo(() => (src ? cardArtDelivery(src) : null), [src])

  if (delivery && !failed) {
    return (
      <img
        src={delivery.src}
        srcSet={delivery.srcSet}
        alt={alt}
        width={488}
        height={680}
        loading={loading}
        decoding="async"
        onError={() => setFailed(true)}
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
