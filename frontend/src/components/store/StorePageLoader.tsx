import { useParams } from 'react-router'
import { Loader2 } from 'lucide-react'
import { useStore } from '../../hooks'

/**
 * Full-page loading screen shown while a storefront screen's primary data
 * is still loading. Shows the store's icon breathing in and out; stores
 * without a logo get a spinner in their brand color instead (brand-*
 * tokens follow the store palette via the theme hook). Pages render this
 * only during an initial load, so fully-cached transitions stay instant.
 */
export function StorePageLoader({ label = 'Loading…' }: { label?: string }) {
  const { slug = '' } = useParams()
  const { data: store } = useStore(slug)

  return (
    <div role="status" aria-live="polite" className="grid min-h-[55vh] place-items-center">
      <div className="flex flex-col items-center gap-4">
        {store?.logoUrl ? (
          <img
            src={store.logoUrl}
            alt=""
            className="animate-logo-breathe size-20 rounded-2xl object-contain drop-shadow-md"
          />
        ) : (
          <Loader2 aria-hidden className="size-10 animate-spin text-brand-500" />
        )}
        <p className="text-sm font-medium text-fg-muted">{label}</p>
      </div>
    </div>
  )
}

export default StorePageLoader
