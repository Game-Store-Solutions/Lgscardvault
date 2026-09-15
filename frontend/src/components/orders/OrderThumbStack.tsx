import type { ReactNode } from 'react'
import type { Order } from '../../api/types'
import { cx } from '../../lib/cx'
import { orderThumbStack } from '../../lib/orders'
import { CardImage } from '../cards/CardImage'

const EMPTY = 'bg-black/[0.04] dark:bg-white/[0.06]'
const RING = 'ring-2 ring-bg'

const SIZE = {
  account: {
    card: 'h-[5.75rem] w-[4.1rem] rounded-xl sm:h-36 sm:w-[6.5rem]',
    overlap: '-space-x-4',
    extraText: 'text-sm font-bold text-fg-muted',
    extraBg: EMPTY,
    quality: 'display' as const,
    max: 2,
  },
  table: {
    card: 'h-11 w-8 rounded-lg',
    overlap: '-space-x-1',
    extraText: 'text-xs font-bold tabular-nums text-fg',
    extraBg: 'bg-surface-elevated',
    quality: 'thumb' as const,
    max: 1,
  },
}

export function OrderThumbStack({
  order,
  size = 'table',
  fallback,
}: {
  order: Pick<Order, 'lines'>
  size?: keyof typeof SIZE
  fallback?: ReactNode
}) {
  const box = SIZE[size]
  const { thumbs, extra } = orderThumbStack(order, box.max)
  const frame = cx(box.card, 'shrink-0 overflow-hidden')

  if (thumbs.length === 0) {
    return (
      <span className={cx(frame, 'grid place-items-center', EMPTY, 'ring-1 ring-border')}>
        {fallback ?? null}
      </span>
    )
  }

  return (
    <span className={cx('flex shrink-0', box.overlap)}>
      {thumbs.map((src, index) => (
        <span key={`${src}-${index}`} className={cx(frame, 'shadow-sm', RING)}>
          <CardImage
            src={src}
            alt=""
            showLabel={false}
            quality={box.quality}
            loading="eager"
            className="size-full"
          />
        </span>
      ))}
      {extra > 0 ? (
        <span
          className={cx(
            frame,
            'grid place-items-center',
            box.extraBg,
            RING,
            box.extraText,
          )}
        >
          +{extra}
        </span>
      ) : null}
    </span>
  )
}
