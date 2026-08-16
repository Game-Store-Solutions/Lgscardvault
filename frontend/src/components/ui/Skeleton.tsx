import { cx } from '../../lib/cx'

export interface SkeletonProps {
  className?: string
}

/** Block placeholder with dark-tinted shimmer (see index.css `.skeleton-shimmer`). */
export function Skeleton({ className }: SkeletonProps) {
  return <div aria-hidden className={cx('rounded-md skeleton-shimmer', className)} />
}

/** Grid of card-shaped skeletons for storefront inventory loading. */
export function InventoryGridSkeleton({ count = 10 }: { count?: number }) {
  return (
    <div
      className="grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6"
      aria-busy="true"
      aria-label="Loading inventory"
    >
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="glass-card overflow-hidden rounded-card">
          <Skeleton className="aspect-5/7 w-full rounded-none" />
          <div className="space-y-2 p-3">
            <Skeleton className="h-4 w-4/5" />
            <Skeleton className="h-3 w-2/3" />
            <Skeleton className="h-3 w-1/3" />
          </div>
        </div>
      ))}
    </div>
  )
}

/** Horizontal listing-card skeletons for the store-admin inventory grid. */
export function InventoryAdminListSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div
      className="grid gap-4 xl:grid-cols-2 2xl:grid-cols-3"
      aria-busy="true"
      aria-label="Loading inventory"
    >
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="flex gap-4 rounded-card border border-border bg-surface p-4">
          <Skeleton className="h-40 w-[7rem] flex-shrink-0 rounded-btn" />
          <div className="flex min-w-0 flex-1 flex-col gap-2 py-1">
            <Skeleton className="h-5 w-3/4" />
            <Skeleton className="h-3 w-1/3" />
            <Skeleton className="mt-auto h-4 w-1/4" />
          </div>
        </div>
      ))}
    </div>
  )
}
