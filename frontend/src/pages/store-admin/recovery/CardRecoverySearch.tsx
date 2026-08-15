import { useEffect, useState } from 'react'
import { Link2, Search, X } from 'lucide-react'
import { cardImage, extractErrorMessage, formatScryfallPrice } from '../../../api/client'
import type { CardSummary } from '../../../api/types'
import { Button, Input, Spinner } from '../../../components/ui'
import { useDebouncedValue } from '../../../hooks'
import { cx } from '../../../lib/cx'
import { looksLikeCardReference } from './looksLikeCardReference'
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
 * Catalog search for one failed row. Results are the page; filters and the
 * Scryfall-paste escape hatch stay out of the way until needed.
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
  const [showLink, setShowLink] = useState(false)
  const [referenceError, setReferenceError] = useState<string | null>(null)

  const debouncedTerm = useDebouncedValue(term, 350)
  const isReference = looksLikeCardReference(debouncedTerm)
  const { data, isFetching, refetch } = useRecoverySearch(
    slug,
    importId,
    debouncedTerm,
    filters,
    !isReference,
  )
  const { resolveByReference } = useRecoveryActions(slug, importId)

  useEffect(() => {
    if (!isReference) return
    let cancelled = false
    setReferenceError(null)
    void resolveByReference
      .mutateAsync(debouncedTerm.trim())
      .then((card) => {
        if (!cancelled) onSelect(card)
      })
      .catch((error) => {
        if (!cancelled) {
          setReferenceError(extractErrorMessage(error, 'Could not resolve that Scryfall link.'))
        }
      })
    return () => {
      cancelled = true
    }
    // resolveByReference identity is stable enough per slug/import; term is the trigger.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedTerm, isReference])

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
      setShowLink(false)
    } catch (error) {
      setReferenceError(extractErrorMessage(error, 'Could not resolve that reference.'))
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <div className="relative min-w-0 flex-1">
          <Search aria-hidden className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-fg-muted" />
          <input
            value={term}
            onChange={(event) => onTermChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key !== 'Enter') return
              if (looksLikeCardReference(term)) return
              void refetch()
            }}
            placeholder="Search printings or paste a Scryfall link"
            aria-label="Search printings or paste a Scryfall link"
            className="w-full rounded-[var(--radius-input)] border border-border bg-bg py-2 pl-9 pr-3 text-sm text-fg placeholder:text-fg-muted focus-visible:border-brand-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/30"
          />
        </div>
        <button
          type="button"
          onClick={() => setShowLink((open) => !open)}
          className={cx(
            'inline-flex size-10 shrink-0 items-center justify-center rounded-[var(--radius-input)] border text-fg-muted hover:text-fg',
            showLink ? 'border-brand-400 text-brand-600' : 'border-border',
          )}
          aria-expanded={showLink}
          aria-label="Paste a Scryfall link"
          title="Paste a Scryfall link"
        >
          <Link2 aria-hidden className="size-4" />
        </button>
      </div>

      {showLink && (
        <div className="flex items-end gap-2">
          <Input
            label="Scryfall link or set/collector"
            value={reference}
            onChange={(event) => setReference(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') void submitReference()
            }}
            placeholder="scryfall.com/card/clb/532 — or clb/532"
          />
          <Button variant="secondary" loading={resolveByReference.isPending} onClick={() => void submitReference()}>
            Use
          </Button>
        </div>
      )}

      {referenceError && (
        <p role="alert" className="text-sm text-danger-700">
          {referenceError}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-1.5">
        <FilterChip label="Set" value={filters.set} onClear={() => onFiltersChange({ ...filters, set: '' })} />
        <FilterChip
          label="#"
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
          className="rounded-full border border-border px-2.5 py-0.5 text-xs text-fg-muted hover:text-fg"
        >
          {filters.finish === 'foil' ? 'Foil' : 'Nonfoil'}
        </button>
        {hasNarrowingFilters && (
          <button type="button" onClick={clearAllFilters} className="text-xs text-fg-muted hover:text-fg hover:underline">
            Name only
          </button>
        )}
        {relaxationNotice && <span className="text-xs text-fg-muted">{relaxationNotice}</span>}
      </div>

      {(isFetching || (isReference && resolveByReference.isPending)) && items.length === 0 ? (
        <div className="flex justify-center py-10">
          <Spinner />
        </div>
      ) : (
        <div className="grid gap-2 sm:grid-cols-2">
          {items.map((card) => (
            <button
              key={card.id}
              type="button"
              onClick={() => onSelect(card)}
              className={cx(
                'flex items-center gap-3 rounded-card border p-2.5 text-left transition-colors',
                card.id === selectedCardId
                  ? 'border-brand-500 bg-brand-50/50 ring-1 ring-brand-500 dark:bg-brand-500/10'
                  : 'border-border hover:border-brand-300',
              )}
            >
              {cardImage(card) && (
                <img src={cardImage(card)} alt="" className="h-16 rounded-btn" loading="lazy" />
              )}
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium leading-snug text-fg">{card.name}</span>
                <span className="mt-0.5 block text-xs text-fg-muted">
                  {(card.setCode ?? '-').toUpperCase()} #{card.collectorNumber ?? '-'}
                </span>
                <span className="mt-1 block text-sm font-semibold text-brand-600">
                  {formatScryfallPrice(card, filters.finish)}
                </span>
              </span>
            </button>
          ))}
        </div>
      )}

      {!isReference &&
        !isFetching &&
        items.length === 0 &&
        rejected.length === 0 &&
        debouncedTerm.trim() !== '' && (
          <p className="text-sm text-fg-muted">No stockable printing found. Paste a Scryfall link, or skip this row.</p>
        )}

      {rejected.length > 0 && (
        <p className="text-xs text-fg-muted">
          {items.length > 0 ? 'Hidden · ' : ''}
          {rejected.slice(0, 3).map((entry, index) => (
            <span key={entry.card.id}>
              {index > 0 ? ' · ' : ''}
              {(entry.card.setCode ?? '').toUpperCase()} #{entry.card.collectorNumber}{' '}
              {/market price|\$0/i.test(entry.reason) ? 'no price' : 'online-only'}
            </span>
          ))}
          {rejected.length > 3 ? ` · +${rejected.length - 3}` : ''}
        </p>
      )}
    </div>
  )
}

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
    <span className="inline-flex items-center gap-1 rounded-full border border-border px-2.5 py-0.5 text-xs text-fg">
      {label} {value.toUpperCase()}
      <button type="button" onClick={onClear} aria-label={`Ignore ${label} filter`} className="text-fg-muted hover:text-fg">
        <X aria-hidden className="size-3" />
      </button>
    </span>
  )
}
