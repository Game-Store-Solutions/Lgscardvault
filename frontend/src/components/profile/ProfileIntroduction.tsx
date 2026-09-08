import { Link } from 'react-router'
import { cardImage } from '../../api/client'
import type { CustomerWantListEntry } from '../../api/types'
import { CardImage } from '../cards/CardImage'
import { Badge } from '../ui'
import { ProfileSection } from './ProfileLayout'

const PREVIEW_LIMIT = 8

export function ProfileIntroduction({
  stats,
  className,
}: {
  stats?: Array<{ id: string; label: string; value: number; onClick?: () => void }>
  className?: string
}) {
  return (
    <div className={className ?? 'py-5 first:pt-0'}>
      <h2 className="text-sm font-extrabold text-fg">Summary</h2>

      {stats && stats.length > 0 ? (
        <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-3">
          {stats.map((stat) => {
            const value = (
              <>
                <dt className="text-[11px] font-bold uppercase tracking-wide text-fg-muted">{stat.label}</dt>
                <dd className="mt-0.5 font-display text-xl font-extrabold tabular-nums text-fg">
                  {stat.value.toLocaleString()}
                </dd>
              </>
            )
            if (stat.onClick) {
              return (
                <button
                  key={stat.id}
                  type="button"
                  onClick={stat.onClick}
                  className="rounded-lg text-left hover:text-brand-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40"
                >
                  {value}
                </button>
              )
            }
            return <div key={stat.id}>{value}</div>
          })}
        </dl>
      ) : null}
    </div>
  )
}

export function ProfileWantList({
  entries = [],
  total = 0,
  loading = false,
  onOpenWantList,
}: {
  entries?: CustomerWantListEntry[]
  total?: number
  loading?: boolean
  onOpenWantList?: () => void
}) {
  return (
    <ProfileSection
      title="Want list"
      action={
        onOpenWantList && total > 0 ? (
          <button
            type="button"
            onClick={onOpenWantList}
            className="text-sm font-semibold text-brand-600 hover:underline"
          >
            View all
          </button>
        ) : null
      }
    >
      <WantListPreview entries={entries} total={total} loading={loading} onOpenWantList={onOpenWantList} />
    </ProfileSection>
  )
}

function WantListPreview({
  entries,
  total,
  loading,
  onOpenWantList,
}: {
  entries: CustomerWantListEntry[]
  total: number
  loading: boolean
  onOpenWantList?: () => void
}) {
  if (loading && entries.length === 0) {
    return (
      <ul className={previewListClass}>
        {Array.from({ length: 4 }, (_, index) => (
          <li key={index} className={previewItemClass}>
            <span className="block aspect-[63/88] rounded-lg bg-fg/[0.06]" />
          </li>
        ))}
      </ul>
    )
  }

  if (entries.length === 0) {
    return (
      <div className="py-1">
        <p className="text-sm text-fg-muted">No cards on your want list yet.</p>
        {onOpenWantList ? (
          <button
            type="button"
            onClick={onOpenWantList}
            className="mt-2 text-sm font-semibold text-brand-600 hover:underline"
          >
            Add cards
          </button>
        ) : null}
      </div>
    )
  }

  const shown = entries.slice(0, PREVIEW_LIMIT)
  const extra = Math.max(0, total - shown.length)

  return (
    <ul className={previewListClass}>
      {shown.map((entry) => (
        <li key={`${entry.storeSlug ?? 'store'}-${entry.id}`} className={previewItemClass}>
          <WantCard entry={entry} onOpenWantList={onOpenWantList} />
        </li>
      ))}
      {extra > 0 && onOpenWantList ? (
        <li className={previewItemClass}>
          <button
            type="button"
            onClick={onOpenWantList}
            className="grid aspect-[63/88] w-full place-items-center rounded-lg bg-fg/[0.06] text-center ring-1 ring-border hover:bg-fg/[0.1]"
          >
            <span className="px-2 text-sm font-extrabold tabular-nums text-fg">+{extra}</span>
          </button>
        </li>
      ) : null}
    </ul>
  )
}

const previewListClass =
  'flex snap-x snap-mandatory gap-3 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] sm:grid sm:grid-cols-[repeat(auto-fill,12rem)] sm:justify-start sm:gap-x-4 sm:gap-y-5 sm:overflow-visible [&::-webkit-scrollbar]:hidden'

const previewItemClass = 'w-36 shrink-0 snap-start sm:w-48'

function WantCard({ entry, onOpenWantList }: { entry: CustomerWantListEntry; onOpenWantList?: () => void }) {
  const image = entry.card ? cardImage(entry.card) : undefined
  const href =
    entry.storeSlug && entry.inventoryItemId ? `/s/${entry.storeSlug}/cards/${entry.inventoryItemId}` : null
  const art = (
    <span className="block overflow-hidden rounded-xl bg-bg shadow-sm ring-1 ring-border">
      <CardImage src={image} alt={entry.cardName} showLabel={false} className="aspect-[63/88] h-auto w-full" />
    </span>
  )

  return (
    <div>
      <div className="relative">
        {href ? (
          <Link to={href} className="block transition-opacity hover:opacity-90" title={entry.cardName}>
            {art}
          </Link>
        ) : onOpenWantList ? (
          <button type="button" onClick={onOpenWantList} className="block w-full text-left" title={entry.cardName}>
            {art}
          </button>
        ) : (
          art
        )}
        <span
          className={
            entry.inStock
              ? 'pointer-events-none absolute bottom-1.5 right-1.5 rounded-full bg-success-500 px-2 py-0.5 text-[11px] font-bold text-white shadow-sm'
              : 'pointer-events-none absolute bottom-1.5 right-1.5 rounded-full bg-warning-500 px-2 py-0.5 text-[11px] font-bold text-white shadow-sm'
          }
        >
          {entry.inStock ? 'In store' : 'Not in store'}
        </span>
      </div>
      <div className="mt-2 flex flex-wrap gap-1">
        {entry.storeName ? (
          <Badge tone="brand" className="px-2 py-0 text-[11px]">
            {entry.storeName}
          </Badge>
        ) : null}
        {entry.setCode ? <Badge className="px-2 py-0 text-[11px]">{entry.setCode.toUpperCase()}</Badge> : null}
        <Badge tone={entry.isFoil ? 'brand' : 'neutral'} className="px-2 py-0 text-[11px]">
          {entry.finish}
        </Badge>
        <Badge className="px-2 py-0 text-[11px]">Qty {entry.quantity}</Badge>
      </div>
    </div>
  )
}
