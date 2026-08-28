import { Search } from 'lucide-react'
import type { CommanderSummary } from '../../hooks'
import { EmptyState, Skeleton } from '../../components/ui'
import { CardImage } from '../../components/cards'
import { colorPips } from './utils'

export function CommanderSearchGrid({
  searchResults,
  fetching,
  pickCommander,
}: {
  searchResults: CommanderSummary[]
  fetching: boolean
  pickCommander: (commander: CommanderSummary) => void
}) {
  if (searchResults.length === 0 && !fetching) {
    return (
      <EmptyState
        icon={Search}
        title="No commanders matched"
        description="Try a different spelling or a shorter name fragment."
      />
    )
  }

  if (searchResults.length === 0) {
    return (
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="flex gap-3 rounded-card border border-border bg-surface p-3">
            <Skeleton className="h-20 w-14 shrink-0 rounded-md" />
            <div className="flex-1 space-y-2 py-1">
              <Skeleton className="h-4 w-4/5" />
              <Skeleton className="h-3 w-2/3" />
            </div>
          </div>
        ))}
      </div>
    )
  }

  return (
    <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {searchResults.map((commander) => (
        <li key={commander.id}>
          <button
            type="button"
            onClick={() => pickCommander(commander)}
            className="flex h-full w-full gap-3 rounded-card border border-border bg-surface p-3 text-left shadow-sm transition-colors hover:border-brand-400 hover:bg-brand-50/40"
          >
            <div className="h-20 w-14 shrink-0 overflow-hidden rounded-md bg-bg">
              {commander.imageUrl ? (
                <img
                  src={commander.imageUrl}
                  alt=""
                  className="h-full w-full object-cover"
                />
              ) : (
                <CardImage src={null} alt={commander.name} className="h-full w-full" showLabel={false} />
              )}
            </div>
            <div className="min-w-0 flex-1 self-center">
              <p className="font-display text-sm font-extrabold leading-snug text-fg">
                {commander.name}
              </p>
              <p className="mt-1 line-clamp-2 text-xs text-fg-muted">{commander.typeLine}</p>
              <div className="mt-2">{colorPips(commander.colorIdentity)}</div>
            </div>
          </button>
        </li>
      ))}
    </ul>
  )
}
