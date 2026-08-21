import { ShoppingCart } from 'lucide-react'
import { formatPrice } from '../../api/client'
import type { SealedInventoryLine } from '../../api/types'
import { Badge, Button } from '../ui'
import { CardImage } from '../cards'
import { cx } from '../../lib/cx'

export function SealedProductCard({
  line,
  cartQty,
  pending,
  onAdd,
  className,
}: {
  line: SealedInventoryLine
  cartQty: number
  pending: boolean
  onAdd: () => void
  className?: string
}) {
  const product = line.product
  if (!product) return null

  const lowStock = line.quantity <= 3

  return (
    <article className={cx('group relative w-full', className)}>
      <div
        className={cx(
          'relative flex aspect-[5/7] w-full items-center justify-center overflow-hidden rounded-xl store-frame store-frame-tile p-3',
          'transition-colors group-hover:border-brand-500/40',
        )}
      >
        <CardImage src={product.imageUrl} alt={product.name} fit="contain" className="max-h-full max-w-full" />
        {lowStock && (
          <Badge tone="warning" className="absolute left-2 top-2">
            Low stock
          </Badge>
        )}
        {cartQty > 0 && (
          <span className="absolute right-2 top-2 grid size-7 place-items-center rounded-full bg-brand-500 text-xs font-bold text-white shadow-sm">
            {cartQty}
          </span>
        )}
      </div>
      <div className="mt-2 px-0.5">
        <h3
          className="line-clamp-2 min-h-[2.5rem] font-display text-sm font-bold leading-snug tracking-tight text-fg"
          title={product.name}
        >
          {product.name}
        </h3>
        {product.setName ? (
          <p className="mt-0.5 truncate text-xs text-fg-muted">{product.setName}</p>
        ) : null}
        <div className="mt-1 flex items-center justify-between gap-2">
          <span className="font-display text-sm font-bold text-fg">{formatPrice(line.priceCents)}</span>
          <Button
            size="sm"
            variant="secondary"
            disabled={pending || line.quantity < 1}
            onClick={onAdd}
            className="shrink-0"
            aria-label={cartQty > 0 ? `Add another ${product.name}` : `Add ${product.name} to cart`}
          >
            <ShoppingCart aria-hidden className="size-4" />
          </Button>
        </div>
      </div>
    </article>
  )
}
