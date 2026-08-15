import { useEffect, useState } from 'react'
import { Link2, Search, X } from 'lucide-react'
import { cardImage, extractErrorMessage, formatScryfallPrice } from '../../../api/client'
import type { CardSummary } from '../../../api/types'
import { Button, FilterPill, Input, Spinner } from '../../../components/ui'
import { CardImage } from '../../../components/cards'
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
  onResultsChange?: (items: CardSummary[]) => void
}

/**
 * Catalog search for one failed row. With set filters this is the ladder
 * (confirm the sheet's printing). Without them it is the in-app Scryfall
 * prints grid — same unique=prints list, click to use, no extra tab.
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
  onResultsChange,
}: CardRecoverySearchProps) {
  const [reference, setReference] = useState('')
  const [showLink, setShowLink] = useState(false)
  const [referenceError, setReferenceError] = useState<string | null>(null)

  const debouncedTerm = useDebouncedValue(term, 350)
  const isReference = looksLikeCardReference(debouncedTerm)
  const browsing = !filters.set && !filters.collectorNumber
  const { data, isFetching, refetch } = useRecoverySearch(
    slug,
    importId,
    debouncedTerm,
    filters,
    !isReference,
    browsing,
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

  useEffect(() => {
    onResultsChange?.(data?.items ?? [])
  }, [data, onResultsChange])

  useEffect(() => {
    const hits = data?.items ?? []
    if (selectedCardId || hits.length === 0) return
    onSelect(hits[0])
  }, [data, selectedCardId, onSelect])

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
    <div className="space-y-4">
      <div className="rounded-card border border-border bg-bg/70 p-3 sm:p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative min-w-0 flex-1">
            <Search aria-hidden className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-fg-muted" />
            <input
              value={term}
              onChange={(event) => onTermChange(event.target.value)}
              onKeyDown={(event) => {
                if (event.key !== 'Enter') return
                if (looksLikeCardReference(term)) return
                void refetch()
              }}
              placeholder="Search printings"
              aria-label="Search printings by name"
              className="h-11 w-full rounded-[var(--radius-input)] border border-border bg-surface pl-10 pr-3 text-sm text-fg placeholder:text-fg-muted focus-visible:border-brand-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/30"
            />
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowLink((open) => !open)}
            aria-expanded={showLink}
            title="Last resort when search cannot place this row"
            className={showLink ? 'ring-1 ring-fg/20' : undefined}
          >
            <Link2 aria-hidden className="size-4" />
            Paste link
          </Button>
        </div>

        {showLink && (
          <div className="mt-3 flex flex-col gap-2 border-t border-border pt-3 sm:flex-row sm:items-end">
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
              Use link
            </Button>
          </div>
        )}

        {referenceError && (
          <p role="alert" className="mt-2 text-sm text-danger-700">
            {referenceError}
          </p>
        )}

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <FilterPill
            active={filters.finish === 'nonfoil'}
            onClick={() => onFiltersChange({ ...filters, finish: 'nonfoil' })}
          >
            Nonfoil
          </FilterPill>
          <FilterPill
            active={filters.finish === 'foil'}
            onClick={() => onFiltersChange({ ...filters, finish: 'foil' })}
          >
            Foil
          </FilterPill>
          <span className="mx-1 hidden h-4 w-px bg-border sm:block" />
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
          {hasNarrowingFilters && (
            <button type="button" onClick={clearAllFilters} className="text-xs font-medium text-fg-muted hover:text-fg">
              All printings
            </button>
          )}
          {browsing && !hasNarrowingFilters && (
            <span className="text-xs text-fg-muted">Every paper printing of this name</span>
          )}
          {relaxationNotice && <span className="text-xs text-fg-muted">{relaxationNotice}</span>}
        </div>
      </div>

      {(isFetching || (isReference && resolveByReference.isPending)) && items.length === 0 ? (
        <div className="flex justify-center py-16">
          <Spinner />
        </div>
      ) : browsing ? (
        <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-5">
          {items.map((card, index) => {
            const selected = card.id === selectedCardId
            return (
              <button
                key={card.id}
                type="button"
                onClick={() => onSelect(card)}
                className={cx(
                  'group relative overflow-hidden rounded-card border text-left transition-colors',
                  selected
                    ? 'border-fg/30 bg-bg shadow-sm ring-1 ring-fg/15'
                    : 'border-border bg-surface hover:border-fg/20 hover:bg-bg',
                )}
              >
                {index < 6 && (
                  <span
                    aria-hidden
                    className="absolute left-1.5 top-1.5 z-10 grid size-5 place-items-center rounded-btn border border-border bg-bg/90 text-[10px] font-bold text-fg-muted"
                  >
                    {index + 1}
                  </span>
                )}
                <CardImage
                  src={cardImage(card)}
                  alt={card.name}
                  fit="cover"
                  showLabel={false}
                  className="aspect-[5/7] w-full"
                />
                <span className="block px-2 py-1.5">
                  <span className="block truncate text-[11px] font-semibold uppercase tracking-wide text-fg">
                    {(card.setCode ?? '-').toUpperCase()} #{card.collectorNumber ?? '-'}
                  </span>
                  <span className="mt-0.5 block text-xs font-bold text-fg">
                    {formatScryfallPrice(card, filters.finish)}
                  </span>
                </span>
              </button>
            )
          })}
        </div>
      ) : (
        <div className={cx('grid gap-3', items.length === 1 ? 'grid-cols-1' : 'sm:grid-cols-2')}>
          {items.map((card, index) => {
            const selected = card.id === selectedCardId
            return (
              <button
                key={card.id}
                type="button"
                onClick={() => onSelect(card)}
                className={cx(
                  'flex items-center gap-4 rounded-card border p-3 text-left transition-colors',
                  selected
                    ? 'border-fg/30 bg-bg shadow-sm ring-1 ring-fg/15'
                    : 'border-border bg-surface hover:border-fg/20 hover:bg-bg',
                )}
              >
                {index < 6 && (
                  <span
                    aria-hidden
                    className="grid size-6 shrink-0 place-items-center rounded-btn border border-border text-[11px] font-bold text-fg-muted"
                  >
                    {index + 1}
                  </span>
                )}
                <CardImage
                  src={cardImage(card)}
                  alt={card.name}
                  fit="contain"
                  showLabel={false}
                  className="h-28 w-[5.25rem] shrink-0 rounded-btn"
                />
                <span className="min-w-0 flex-1">
                  <span className="block font-display text-base font-bold leading-snug text-fg">{card.name}</span>
                  <span className="mt-1 block text-xs uppercase tracking-wide text-fg-muted">
                    {(card.setCode ?? '-').toUpperCase()} #{card.collectorNumber ?? '-'}
                    {card.rarity ? ` · ${card.rarity}` : ''}
                  </span>
                  <span className="mt-3 block font-display text-lg font-bold text-fg">
                    {formatScryfallPrice(card, filters.finish)}
                  </span>
                </span>
              </button>
            )
          })}
        </div>
      )}

      {!isReference &&
        !isFetching &&
        items.length === 0 &&
        rejected.length === 0 &&
        debouncedTerm.trim() !== '' && (
          <p className="rounded-card border border-dashed border-border px-4 py-8 text-center text-sm text-fg-muted">
            {browsing
              ? 'No paper printing of this name. Try another spelling, or skip.'
              : 'No printing matched those filters. Open all printings, or skip.'}
          </p>
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
    <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface px-2.5 py-1 text-xs font-medium text-fg">
      {label} {value.toUpperCase()}
      <button type="button" onClick={onClear} aria-label={`Ignore ${label} filter`} className="text-fg-muted hover:text-fg">
        <X aria-hidden className="size-3" />
      </button>
    </span>
  )
}
