import { useState } from 'react'
import { Link2, Search, X } from 'lucide-react'
import { cardImage, extractErrorMessage, formatScryfallPrice } from '../../../api/client'
import type { CardSummary } from '../../../api/types'
import { Badge, Button, Input, Spinner } from '../../../components/ui'
import { useDebouncedValue } from '../../../hooks'
import { cx } from '../../../lib/cx'
import {
  describeRelaxations,
  useRecoveryActions,
  useRecoverySearch,
  type RecoveryFilters,
} from './useImportRecovery'

export interface CardRecoverySearchProps {
  slug: string
  importId: string
  term: string
  onTermChange: (term: string) => void
  filters: RecoveryFilters
  onFiltersChange: (filters: RecoveryFilters) => void
  selectedCardId: string | null
  onSelect: (card: CardSummary) => void
}

/**
 * Catalog search for one failed row.
 *
 * The filters a CSV row contributes used to be invisible, so an empty result
 * looked like "this card does not exist" when it really meant "your sheet's
 * collector number is wrong". Here every filter is a chip the operator can
 * drop, the server reports which ones it had to relax on their behalf, and
 * printings that matched but cannot be stocked are shown struck through with
 * the reason rather than silently removed.
 */
export function CardRecoverySearch({
  slug,
  importId,
  term,
  onTermChange,
  filters,
  onFiltersChange,
  selectedCardId,
  onSelect,
}: CardRecoverySearchProps) {
  const [reference, setReference] = useState('')
  const [referenceError, setReferenceError] = useState<string | null>(null)

  // Each search can cost the ladder several Scryfall calls, so type-ahead is
  // debounced rather than fired per keystroke.
  const debouncedTerm = useDebouncedValue(term, 350)
  const { data, isFetching, refetch } = useRecoverySearch(slug, importId, debouncedTerm, filters, true)
  const { resolveByReference } = useRecoveryActions(slug, importId)

  const items = data?.items ?? []
  const rejected = data?.rejected ?? []
  const relaxationNotice = describeRelaxations(data?.relaxed ?? [])
  const hasNarrowingFilters = Boolean(filters.set || filters.collectorNumber || filters.rarity)

  function clearAllFilters() {
    onFiltersChange({ ...filters, set: '', collectorNumber: '', rarity: '' })
  }

  async function submitReference() {
    const trimmed = reference.trim()
    if (!trimmed) return
    setReferenceError(null)
    try {
      const card = await resolveByReference.mutateAsync(trimmed)
      onSelect(card)
      setReference('')
    } catch (error) {
      setReferenceError(extractErrorMessage(error, 'Could not resolve that reference.'))
    }
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
        <Input
          label="Search the catalog"
          value={term}
          onChange={(event) => onTermChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') void refetch()
          }}
          placeholder="Card name"
        />
        <Button variant="secondary" loading={isFetching} onClick={() => void refetch()}>
          <Search aria-hidden className="size-4" />
          Search
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-bold uppercase tracking-wide text-fg-muted">Filters</span>

        <FilterChip
          label="Set"
          value={filters.set}
          onClear={() => onFiltersChange({ ...filters, set: '' })}
        />
        <FilterChip
          label="Collector"
          value={filters.collectorNumber}
          onClear={() => onFiltersChange({ ...filters, collectorNumber: '' })}
        />
        <FilterChip
          label="Rarity"
          value={filters.rarity}
          onClear={() => onFiltersChange({ ...filters, rarity: '' })}
        />

        <button
          type="button"
          onClick={() =>
            onFiltersChange({ ...filters, finish: filters.finish === 'foil' ? 'nonfoil' : 'foil' })
          }
          className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface px-3 py-1 text-xs font-bold text-fg hover:border-brand-400"
        >
          {filters.finish === 'foil' ? 'Foil' : 'Nonfoil'}
        </button>

        {hasNarrowingFilters && (
          <button
            type="button"
            onClick={clearAllFilters}
            className="text-xs font-bold text-brand-600 hover:underline"
          >
            Search by name only
          </button>
        )}
      </div>

      {relaxationNotice && (
        <p className="rounded-card border border-warning-500/40 bg-warning-50 px-3 py-2 text-sm text-warning-700">
          {relaxationNotice}
        </p>
      )}

      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
        <Input
          label="Or paste a Scryfall link"
          value={reference}
          onChange={(event) => setReference(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') void submitReference()
          }}
          placeholder="scryfall.com/card/mh3/20/... — or mh3/20"
        />
        <Button variant="secondary" loading={resolveByReference.isPending} onClick={() => void submitReference()}>
          <Link2 aria-hidden className="size-4" />
          Use link
        </Button>
      </div>

      {referenceError && (
        <p role="alert" className="text-sm font-medium text-danger-700">
          {referenceError}
        </p>
      )}

      {isFetching && items.length === 0 ? (
        <div className="flex justify-center py-8">
          <Spinner />
        </div>
      ) : (
        <div className="grid gap-2 md:grid-cols-2">
          {items.map((card) => (
            <button
              key={card.id}
              type="button"
              onClick={() => onSelect(card)}
              className={cx(
                'flex items-start gap-3 rounded-card border p-3 text-left transition-colors',
                card.id === selectedCardId
                  ? 'border-brand-500 bg-brand-50/60 ring-1 ring-brand-500'
                  : 'border-border bg-surface hover:border-brand-300',
              )}
            >
              {cardImage(card) && (
                <img src={cardImage(card)} alt="" className="h-20 rounded-btn" loading="lazy" />
              )}
              <span className="min-w-0 flex-1">
                <span className="block font-bold leading-snug text-fg">{card.name}</span>
                <span className="mt-0.5 block text-xs uppercase tracking-wide text-fg-muted">
                  {(card.setCode ?? '-').toUpperCase()} #{card.collectorNumber ?? '-'}
                </span>
                <span className="mt-1.5 block text-sm font-bold text-brand-600">
                  {formatScryfallPrice(card, filters.finish)}
                </span>
              </span>
            </button>
          ))}
        </div>
      )}

      {!isFetching && items.length === 0 && rejected.length === 0 && debouncedTerm.trim() !== '' && (
        <p className="text-sm text-fg-muted">
          Nothing found, even after widening the search. Paste the Scryfall link above, or skip this
          row if the card does not exist.
        </p>
      )}

      {rejected.length > 0 && (
        <div className="space-y-2 rounded-card border border-border bg-bg p-3">
          <p className="text-xs font-bold uppercase tracking-wide text-fg-muted">
            Found, but cannot be stocked
          </p>
          {rejected.map((entry) => (
            <div key={entry.card.id} className="flex items-center gap-3 text-sm">
              <Badge tone="danger">
                {/market price|\$0/i.test(entry.reason) ? 'No price' : 'Online only'}
              </Badge>
              <span className="font-medium text-fg-muted line-through">
                {entry.card.name} · {(entry.card.setCode ?? '-').toUpperCase()} #
                {entry.card.collectorNumber ?? '-'}
              </span>
              <span className="text-xs text-fg-muted">{entry.reason}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

/** One removable filter chip; renders nothing when the filter is unset. */
function FilterChip({
  label,
  value,
  onClear,
}: {
  label: string
  value: string
  onClear: () => void
}) {
  if (!value) return null

  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-brand-300 bg-brand-50 px-3 py-1 text-xs font-bold text-brand-700">
      {label}: {value.toUpperCase()}
      <button
        type="button"
        onClick={onClear}
        aria-label={`Ignore ${label.toLowerCase()} filter`}
        className="rounded-full p-0.5 hover:bg-brand-200"
      >
        <X aria-hidden className="size-3" />
      </button>
    </span>
  )
}
