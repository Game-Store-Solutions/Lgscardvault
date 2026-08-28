import { cardImage } from '../../api/client'
import { CardImage } from '../../components/cards'
import { cx } from '../../lib/cx'

export const STACK_DEPTH = 4
/** Visible strip per card behind the front face. */
export const STACK_PEEK_PX = 28
/** Shift art up so peek strips show illustration, not the title bar. */
const PEEK_ART_SHIFT = '-translate-y-[24%]'

type StackCardSource = {
  card: {
    oracleId: string
    name: string
    imageUrl?: string | null
    imageUris?: { png?: string; large?: string; normal?: string; small?: string } | null
    cardFaces?: {
      imageUrl?: string | null
      imageUris?: { png?: string; large?: string; normal?: string; small?: string } | null
    }[]
  }
  inventoryItem?: {
    card: {
      name: string
      oracleId?: string
      imageUrl?: string | null
      imageUris?: { png?: string; large?: string; normal?: string; small?: string } | null
      cardFaces?: {
        imageUrl?: string | null
        imageUris?: { png?: string; large?: string; normal?: string; small?: string } | null
      }[]
    }
  } | null
}

export function stackCardImage(row: StackCardSource): string | undefined {
  return cardImage(row.inventoryItem?.card ?? row.card)
}

export function stackCardName(row: StackCardSource): string {
  return row.inventoryItem?.card.name ?? row.card.name
}

export function CardStackLayers<T extends StackCardSource>({
  rows,
  onOpen,
}: {
  rows: T[]
  onOpen: (row: T) => void
}) {
  const stackRows = rows.slice(-STACK_DEPTH)
  const peekCount = Math.max(0, stackRows.length - 1)

  if (stackRows.length === 0) {
    return null
  }

  return (
    <div
      className="relative mx-auto mt-auto w-[88%]"
      style={{ paddingTop: peekCount * STACK_PEEK_PX }}
    >
      <div className="relative w-full aspect-5/7">
        {stackRows.map((row, index) => {
          const isFront = index === stackRows.length - 1
          const layersBehind = stackRows.length - 1 - index
          const name = stackCardName(row)
          const image = stackCardImage(row)

          return (
            <button
              key={row.card.oracleId}
              type="button"
              onClick={() => onOpen(row)}
              className={cx(
                'absolute left-0 w-full overflow-hidden rounded-[4.5%/3.5%] bg-bg shadow-lg ring-1 ring-black/15 transition-transform hover:z-20 hover:scale-[1.03]',
                isFront ? 'inset-0' : 'h-7',
              )}
              style={{
                bottom: isFront ? 0 : `calc(100% + ${(layersBehind - 1) * STACK_PEEK_PX}px)`,
                zIndex: index,
              }}
              title={name}
              aria-label={`View ${name}`}
            >
              <CardImage
                src={image}
                alt={name}
                className={cx('aspect-5/7 w-full', !isFront && PEEK_ART_SHIFT)}
                fit="cover"
                showLabel={false}
                loading="eager"
              />
            </button>
          )
        })}
      </div>
    </div>
  )
}
