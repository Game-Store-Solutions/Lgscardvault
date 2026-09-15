import { useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { ImageOff, RefreshCw, RotateCw } from 'lucide-react'
import { cardArtDelivery } from '../../api/client'
import type { OrderLine } from '../../api/types'
import { cx } from '../../lib/cx'
import { orderLineFaceArt, orderLineImage, orderLineRotateDeg } from '../../lib/orders'

function ThumbImg({
  src,
  alt,
  className,
  style,
  priority,
}: {
  src: string
  alt: string
  className?: string
  style?: CSSProperties
  priority?: boolean
}) {
  const delivery = useMemo(() => cardArtDelivery(src, 'thumb'), [src])
  const imgRef = useRef<HTMLImageElement>(null)
  const [status, setStatus] = useState<'loading' | 'ready' | 'failed'>('loading')

  useLayoutEffect(() => {
    setStatus('loading')
    const img = imgRef.current
    if (!img?.complete) return
    setStatus(img.naturalWidth > 0 ? 'ready' : 'failed')
  }, [delivery.src])

  if (status === 'failed') {
    return (
      <span className={cx('grid place-items-center', className)} style={style}>
        <ImageOff aria-hidden className="size-4 text-fg-muted" />
      </span>
    )
  }

  return (
    <img
      ref={imgRef}
      src={delivery.src}
      srcSet={delivery.srcSet}
      sizes="(min-width: 640px) 104px, 80px"
      alt={alt}
      width={146}
      height={204}
      loading={priority ? 'eager' : 'lazy'}
      fetchPriority={priority ? 'high' : 'auto'}
      decoding="async"
      onLoad={() => setStatus('ready')}
      onError={() => setStatus('failed')}
      className={cx(
        'object-cover transition-opacity duration-200',
        status === 'ready' ? 'opacity-100' : 'opacity-0',
        className,
      )}
      style={style}
    />
  )
}

export function OrderLineArt({
  line,
  compact = false,
  priority = false,
}: {
  line: OrderLine
  compact?: boolean
  /** Above-the-fold thumbs should start immediately, not wait for lazy. */
  priority?: boolean
}) {
  const [faceIndex, setFaceIndex] = useState(0)
  const faces = orderLineFaceArt(line)
  const twoSided = faces.length >= 2
  const rotateDeg = orderLineRotateDeg(line)
  const rotatable = !twoSided && rotateDeg !== undefined
  const canFlip = twoSided || rotatable
  const flipped = canFlip && faceIndex % 2 === 1
  const current = twoSided ? faces[faceIndex % faces.length] : undefined
  const next = twoSided ? faces[(faceIndex + 1) % faces.length] : undefined
  const image = current?.image ?? orderLineImage(line)

  function toggle() {
    if (!canFlip) return
    setFaceIndex((index) => index + 1)
  }

  const frame = cx(
    'relative grid shrink-0 place-items-center overflow-hidden rounded-lg border border-border bg-bg',
    compact ? 'h-[4.5rem] w-[3.25rem]' : 'h-28 w-20 sm:h-36 sm:w-[6.5rem]',
  )

  const art = twoSided ? (
    <span className="block size-full" style={{ perspective: '900px' }}>
      <span
        className="relative block size-full transition-transform duration-500 ease-out"
        style={{
          transformStyle: 'preserve-3d',
          transform: `rotateY(${flipped ? 180 : 0}deg)`,
        }}
      >
        <ThumbImg
          src={faces[0].image}
          alt=""
          priority={priority}
          className="absolute inset-0 size-full"
          style={{ backfaceVisibility: 'hidden' }}
        />
        <ThumbImg
          src={faces[1].image}
          alt=""
          priority={priority}
          className="absolute inset-0 size-full"
          style={{ backfaceVisibility: 'hidden', transform: 'rotateY(180deg)' }}
        />
      </span>
    </span>
  ) : image ? (
    <ThumbImg
      src={image}
      alt=""
      priority={priority}
      className="size-full transition-transform duration-500 ease-out"
      style={rotatable ? { transform: `rotate(${flipped ? rotateDeg : 0}deg)` } : undefined}
    />
  ) : (
    <ImageOff aria-hidden className="size-4 text-fg-muted" />
  )

  const badge = canFlip ? (
    <span
      className={cx(
        'pointer-events-none absolute right-1 z-[1] grid place-items-center rounded-full bg-black/75 text-white shadow-sm',
        compact ? 'top-0.5 size-5' : 'top-1 size-6',
      )}
    >
      {twoSided ? (
        <RefreshCw aria-hidden className={compact ? 'size-2.5' : 'size-3'} />
      ) : (
        <RotateCw aria-hidden className={compact ? 'size-2.5' : 'size-3'} />
      )}
    </span>
  ) : null

  const caption =
    !compact && twoSided && current?.name ? (
      <span className="pointer-events-none absolute inset-x-0 bottom-0 z-[1] bg-black/65 px-1 py-0.5 text-center text-[0.6rem] font-semibold leading-tight text-white">
        {current.name}
      </span>
    ) : null

  const body = (
    <>
      {image || twoSided ? (
        <span aria-hidden className="pointer-events-none absolute inset-0 skeleton-shimmer" />
      ) : null}
      {art}
      {caption}
      {badge}
    </>
  )

  if (!canFlip) {
    return (
      <span className={frame} aria-hidden>
        {body}
      </span>
    )
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={flipped}
      aria-label={
        twoSided
          ? `Flip ${line.cardName} to ${next?.name ?? 'the other face'}`
          : `Rotate ${line.cardName}`
      }
      className={cx(frame, 'cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500')}
    >
      {body}
    </button>
  )
}
