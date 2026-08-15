import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { Search } from 'lucide-react'
import api, { cardImage, formatScryfallPrice } from '../../api/client'
import type { CardSummary, CsvImportRow } from '../../api/types'
import {
  Badge,
  Button,
  EmptyRow,
  Input,
  Modal,
  Table,
  TBody,
  TD,
  TH,
  THead,
  TR,
} from '../../components/ui'
import { ImportStat } from './csv-shared'
import { CONDITIONS } from './FailedRowsTable'

export interface BatchRecoveryResult {
  row: CsvImportRow
  card?: CardSummary | null
  error?: string | null
}

type RowDraft = {
  quantity: number
  condition: string
  isFoil: boolean
  card: CardSummary | null
  search: string
  searching: boolean
}

function draftFromResult(result: BatchRecoveryResult): RowDraft {
  return {
    quantity: Math.max(0, result.row.quantity),
    condition: result.row.condition || 'NM',
    isFoil: result.row.isFoil,
    card: result.card ?? null,
    // Strip Alchemy "A-" name prefix so Find card hits the paper printing.
    search: result.row.name.trim().replace(/^A-/i, ''),
    searching: false,
  }
}

/** Editable batch review for failed CSV rows after Retry failed cards. */
export function BatchRecoveryModal({
  slug,
  importId,
  gameCode,
  results,
  onClose,
  onResolved,
}: {
  slug: string
  importId: string
  gameCode: string
  results: BatchRecoveryResult[] | null
  onClose: () => void
  onResolved: () => Promise<void>
}) {
  const safeResults = results ?? []
  const [drafts, setDrafts] = useState<Record<number, RowDraft>>({})
  const [pickingRow, setPickingRow] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!results) return
    setError(null)
    setPickingRow(null)
    setDrafts(Object.fromEntries(results.map((result) => [result.row.rowIndex, draftFromResult(result)])))
  }, [results])

  const matchedCount = useMemo(
    () => Object.values(drafts).filter((draft) => draft.card != null).length,
    [drafts],
  )
  const needsReview = safeResults.length - matchedCount

  const pickingDraft = pickingRow !== null ? drafts[pickingRow] : null
  const pickingResult = safeResults.find((result) => result.row.rowIndex === pickingRow)

  const { data: searchHits = [], isFetching: searchFetching, refetch: refetchSearch } = useQuery({
    queryKey: ['batch-recovery-search', pickingRow, pickingDraft?.search, gameCode],
    enabled: pickingRow !== null && Boolean(pickingDraft?.search.trim()),
    queryFn: async () => {
      if (!pickingDraft || !pickingResult) return []
      const { data } = await api.get<CardSummary[]>('/catalog/search', {
        params: {
          q: pickingDraft.search.trim(),
          game: gameCode,
          ...(pickingResult.row.set.trim() ? { set: pickingResult.row.set.trim() } : {}),
          finish: pickingDraft.isFoil ? 'foil' : 'nonfoil',
        },
      })
      return data
    },
  })

  function updateDraft(rowIndex: number, patch: Partial<RowDraft>) {
    setDrafts((current) => ({
      ...current,
      [rowIndex]: { ...(current[rowIndex] ?? draftFromResult(safeResults.find((r) => r.row.rowIndex === rowIndex)!)), ...patch },
    }))
  }

  const finalizeMutation = useMutation({
    mutationFn: async () => {
      const items = safeResults
        .map((result) => {
          const draft = drafts[result.row.rowIndex]
          if (!draft?.card) return null
          return {
            rowIndex: result.row.rowIndex,
            cardId: draft.card.id,
            quantity: draft.quantity,
            condition: draft.condition,
            isFoil: draft.isFoil,
          }
        })
        .filter((item): item is NonNullable<typeof item> => item != null)

      await api.post(`/stores/${slug}/csv-imports/${importId}/failed/manual-import`, { items })
    },
    onMutate: () => setError(null),
    onSuccess: onResolved,
    onError: (err: { response?: { data?: { detail?: string } }; message?: string }) => {
      setError(err.response?.data?.detail ?? err.message ?? 'Could not finalize failed card recovery.')
    },
  })

  if (!results) return null

  return (
    <Modal
      open
      onClose={onClose}
      title="Review failed card matches"
      className="max-w-[calc(100vw-2rem)] 2xl:max-w-[92rem]"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={finalizeMutation.isPending}>
            Cancel
          </Button>
          <Button
            variant="primary"
            loading={finalizeMutation.isPending}
            disabled={matchedCount === 0}
            onClick={() => finalizeMutation.mutate()}
          >
            {needsReview === 0 ? 'Finalize all cards' : `Finalize ${matchedCount} matched cards`}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <p className="text-sm text-fg-muted">
          Edit qty / condition / foil, or click <span className="font-semibold text-fg">Find card</span> on a Needs
          review row to pick a printing. Unmatched rows are skipped when you finalize.
        </p>

        <div className="grid gap-3 sm:grid-cols-3">
          <ImportStat label="Matched" value={String(matchedCount)} tone="success" />
          <ImportStat label="Needs review" value={String(needsReview)} tone={needsReview > 0 ? 'danger' : 'neutral'} />
          <ImportStat label="Total" value={String(safeResults.length)} />
        </div>

        {error && (
          <p role="alert" className="text-sm font-medium text-danger-700">
            {error}
          </p>
        )}

        {pickingRow !== null && pickingDraft && (
          <div className="space-y-3 rounded-card border border-brand-200 bg-brand-50/40 p-4">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <p className="text-sm font-bold text-fg">Find a card for row {pickingRow + 1}</p>
                <p className="text-xs text-fg-muted">{pickingResult?.row.name}</p>
              </div>
              <Button variant="secondary" size="sm" onClick={() => setPickingRow(null)}>
                Done searching
              </Button>
            </div>
            <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
              <Input
                label="Search catalog"
                value={pickingDraft.search}
                onChange={(e) => updateDraft(pickingRow, { search: e.target.value })}
              />
              <Button variant="secondary" loading={searchFetching} onClick={() => void refetchSearch()}>
                <Search aria-hidden className="size-4" />
                Search
              </Button>
            </div>
            <div className="grid max-h-56 gap-2 overflow-auto md:grid-cols-2">
              {searchHits.map((card) => (
                <button
                  key={card.id}
                  type="button"
                  className="flex items-center gap-3 rounded-card border border-border bg-surface px-3 py-2 text-left hover:border-brand-400"
                  onClick={() => {
                    updateDraft(pickingRow, { card })
                    setPickingRow(null)
                  }}
                >
                  {cardImage(card) && <img src={cardImage(card)} alt="" className="h-12 rounded-btn" />}
                  <span className="min-w-0">
                    <span className="block font-bold text-fg">{card.name}</span>
                    <span className="block text-xs text-fg-muted">
                      {(card.setCode ?? '-').toUpperCase()} #{card.collectorNumber ?? '-'}
                    </span>
                  </span>
                </button>
              ))}
              {!searchFetching && searchHits.length === 0 && (
                <p className="text-sm text-fg-muted md:col-span-2">No matches — try a simpler name or drop the set filter.</p>
              )}
            </div>
          </div>
        )}

        <div className="max-h-[55vh] overflow-auto rounded-card border border-border">
          <Table>
            <THead>
              <TR className="hover:bg-transparent">
                <TH>CSV row</TH>
                <TH>Matched card</TH>
                <TH>Set</TH>
                <TH>Collector</TH>
                <TH>Qty</TH>
                <TH>Condition</TH>
                <TH>Foil</TH>
                <TH>Market price</TH>
                <TH>Status</TH>
              </TR>
            </THead>
            <TBody>
              {safeResults.map((result) => {
                const draft = drafts[result.row.rowIndex] ?? draftFromResult(result)
                const card = draft.card
                return (
                  <TR key={result.row.rowIndex}>
                    <TD>
                      <div className="min-w-40">
                        <div className="font-bold text-fg">{result.row.name}</div>
                        <div className="text-xs text-fg-muted">Row {result.row.rowIndex + 1}</div>
                      </div>
                    </TD>
                    <TD>
                      {card ? (
                        <div className="flex min-w-56 items-center gap-3">
                          {cardImage(card) && (
                            <img src={cardImage(card)} alt={card.name} className="h-14 rounded-btn" />
                          )}
                          <div className="min-w-0">
                            <div className="font-bold text-fg">{card.name}</div>
                            {card.setName && <div className="text-xs text-fg-muted">{card.setName}</div>}
                            <button
                              type="button"
                              className="mt-1 text-xs font-semibold text-brand-600 hover:underline"
                              onClick={() => setPickingRow(result.row.rowIndex)}
                            >
                              Change card
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="space-y-2">
                          <p className="text-sm text-fg-muted">{result.error ?? 'No match found'}</p>
                          <Button size="sm" variant="secondary" onClick={() => setPickingRow(result.row.rowIndex)}>
                            <Search aria-hidden className="size-4" />
                            Find card
                          </Button>
                        </div>
                      )}
                    </TD>
                    <TD className="uppercase">{card?.setCode ?? result.row.set}</TD>
                    <TD>{card?.collectorNumber ?? result.row.collectorNumber}</TD>
                    <TD>
                      <input
                        type="number"
                        min={0}
                        className="w-16 rounded-btn border border-border bg-surface px-2 py-1 text-sm text-fg"
                        value={draft.quantity}
                        onChange={(e) => updateDraft(result.row.rowIndex, { quantity: Number(e.target.value) })}
                      />
                    </TD>
                    <TD>
                      <select
                        className="rounded-btn border border-border bg-surface px-2 py-1 text-sm text-fg"
                        value={draft.condition}
                        onChange={(e) => updateDraft(result.row.rowIndex, { condition: e.target.value })}
                      >
                        {CONDITIONS.map((c) => (
                          <option key={c} value={c}>
                            {c}
                          </option>
                        ))}
                      </select>
                    </TD>
                    <TD>
                      <select
                        className="rounded-btn border border-border bg-surface px-2 py-1 text-sm text-fg"
                        value={draft.isFoil ? 'yes' : 'no'}
                        onChange={(e) => updateDraft(result.row.rowIndex, { isFoil: e.target.value === 'yes' })}
                      >
                        <option value="no">No</option>
                        <option value="yes">Yes</option>
                      </select>
                    </TD>
                    <TD>{card ? formatScryfallPrice(card, draft.isFoil ? 'foil' : 'nonfoil') : '-'}</TD>
                    <TD>
                      {card ? <Badge tone="success">Ready</Badge> : <Badge tone="danger">Needs review</Badge>}
                    </TD>
                  </TR>
                )
              })}
              {safeResults.length === 0 && <EmptyRow colSpan={9}>No failed cards to resolve.</EmptyRow>}
            </TBody>
          </Table>
        </div>
      </div>
    </Modal>
  )
}
