import { useState } from 'react'
import { ImageOff, RefreshCw, RotateCw } from 'lucide-react'
import type { OrderLine } from '../../api/types'
import { cx } from '../../lib/cx'
import { orderLineFaceArt, orderLineImage, orderLineRotateDeg } from '../../lib/orders'

export function OrderLineArt({
  line,
  compact = false,
}: {
  line: OrderLine
  compact?: boolean
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
        <img
          src={faces[0].image}
          alt={faces[0].name ?? line.cardName}
          className="absolute inset-0 size-full object-cover"
          style={{ backfaceVisibility: 'hidden' }}
        />
        <img
          src={faces[1].image}
          alt={faces[1].name ?? line.cardName}
          className="absolute inset-0 size-full object-cover"
          style={{ backfaceVisibility: 'hidden', transform: 'rotateY(180deg)' }}
        />
      </span>
    </span>
  ) : image ? (
    <img
      src={image}
      alt={line.cardName}
      className="size-full object-cover transition-transform duration-500 ease-out"
      style={rotatable ? { transform: `rotate(${flipped ? rotateDeg : 0}deg)` } : undefined}
    />
  ) : (
    <ImageOff aria-hidden className="size-4 text-fg-muted" />
  )

  const badge = canFlip ? (
    <span
      className={cx(
        'pointer-events-none absolute right-1 grid place-items-center rounded-full bg-black/75 text-white shadow-sm',
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
      <span className="pointer-events-none absolute inset-x-0 bottom-0 bg-black/65 px-1 py-0.5 text-center text-[0.6rem] font-semibold leading-tight text-white">
        {current.name}
      </span>
    ) : null

  if (!canFlip) {
    return (
      <span className={frame}>
        {art}
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
      {art}
      {caption}
      {badge}
    </button>
  )
}
