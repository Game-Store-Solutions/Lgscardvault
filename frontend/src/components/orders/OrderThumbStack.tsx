import type { CSSProperties, ReactNode } from 'react'
import type { Order } from '../../api/types'
import { cx } from '../../lib/cx'
import { orderItemCount, orderThumbStack } from '../../lib/orders'
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
    card: 'h-11 w-8 rounded-md',
    quality: 'thumb' as const,
    max: 3,
  },
}

/** Compact hand of cards: slight fan, Untitled-style ring, count on the front face. */
const FAN: ReadonlyArray<ReadonlyArray<{ x: number; r: number }>> = [
  [{ x: 0, r: 0 }],
  [
    { x: 0, r: -7 },
    { x: 11, r: 5 },
  ],
  [
    { x: 0, r: -10 },
    { x: 9, r: -1 },
    { x: 18, r: 7 },
  ],
]

function TableDeckPeek({
  order,
  fallback,
}: {
  order: Pick<Order, 'lines'>
  fallback?: ReactNode
}) {
  const { thumbs } = orderThumbStack(order, SIZE.table.max)
  const count = orderItemCount(order)
  const frame = cx(SIZE.table.card, 'block overflow-hidden')

  if (thumbs.length === 0) {
    return (
      <span className={cx(frame, 'grid place-items-center', EMPTY, 'ring-1 ring-border')}>
        {fallback ?? null}
      </span>
    )
  }

  const poses = FAN[Math.min(thumbs.length, FAN.length) - 1]
  const showCount = count > thumbs.length
  const width = 32 + (poses[poses.length - 1]?.x ?? 0) + 4

  return (
    <span
      className="relative isolate flex h-11 shrink-0 items-end"
      style={{ width }}
      aria-hidden
    >
      {thumbs.map((src, index) => {
        const pose = poses[index] ?? poses[poses.length - 1]
        const front = index === thumbs.length - 1
        return (
          <span
            key={`${src}-${index}`}
            className={cx(
              frame,
              RING,
              'absolute bottom-0 left-0 origin-bottom shadow-[0_1px_3px_rgba(0,0,0,0.28)]',
              'translate-x-[calc(var(--deck-x)*1px)] rotate-[var(--deck-r)]',
              'transition-transform duration-300 ease-out',
              'group-hover:translate-x-[calc(var(--deck-x)*1.35px)]',
              'motion-reduce:rotate-0 motion-reduce:transition-none',
            )}
            style={
              {
                '--deck-x': String(pose.x),
                '--deck-r': `${pose.r}deg`,
                zIndex: index + 1,
              } as CSSProperties
            }
          >
            <CardImage
              src={src}
              alt=""
              showLabel={false}
              quality={SIZE.table.quality}
              loading="eager"
              className="size-full"
            />
            {showCount && front ? (
              <span className="absolute inset-x-0 bottom-0 flex h-[1.05rem] items-center justify-center bg-zinc-950/70 text-[0.62rem] font-semibold tabular-nums tracking-tight text-white backdrop-blur-[2px]">
                {count > 99 ? '99+' : count}
              </span>
            ) : null}
          </span>
        )
      })}
    </span>
  )
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
  if (size === 'table') {
    const count = orderItemCount(order)
    return (
      <span className="shrink-0">
        <span className="sr-only">{count === 1 ? '1 item' : `${count} items`}</span>
        <TableDeckPeek order={order} fallback={fallback} />
      </span>
    )
  }

  const box = SIZE.account
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
