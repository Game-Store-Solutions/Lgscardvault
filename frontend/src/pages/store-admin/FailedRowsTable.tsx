import { useEffect, useState } from 'react'
import { Search } from 'lucide-react'
import api, { cardImage } from '../../api/client'
import type { CsvImportRow } from '../../api/types'
import { Badge, Button, EmptyRow, Table, TBody, TD, TH, THead, TR } from '../../components/ui'
import { rowMarketPrice } from './csv-shared'

const CONDITIONS = ['NM', 'LP', 'MP', 'HP', 'DMG'] as const

type FailedRowDraft = {
  name: string
  set: string
  collectorNumber: string
  quantity: number
  condition: string
  isFoil: boolean
}

function draftFromRow(row: CsvImportRow): FailedRowDraft {
  return {
    name: row.name,
    set: row.set,
    collectorNumber: row.collectorNumber,
    quantity: row.quantity,
    condition: row.condition || 'NM',
    isFoil: row.isFoil,
  }
}

function RowStatus({ row }: { row: CsvImportRow }) {
  if (row.status === 'error') {
    return (
      <span title={row.error ?? undefined}>
        <Badge tone="danger">{row.error ?? 'Failed'}</Badge>
      </span>
    )
  }
  return <Badge tone="neutral">{row.status}</Badge>
}

/** Editable failed-import table: fix qty/name/set then Save or Resolve. */
export function FailedRowsTable({
  slug,
  importId,
  rows,
  onRecover,
  onSaved,
}: {
  slug: string
  importId: string
  rows: CsvImportRow[]
  onRecover: (row: CsvImportRow) => void
  onSaved: () => void
}) {
  const [drafts, setDrafts] = useState<Record<number, FailedRowDraft>>({})
  const [savingIndex, setSavingIndex] = useState<number | null>(null)
  const [rowError, setRowError] = useState<string | null>(null)

  useEffect(() => {
    setDrafts((current) => {
      const next: Record<number, FailedRowDraft> = {}
      for (const row of rows) {
        next[row.rowIndex] = current[row.rowIndex] ?? draftFromRow(row)
      }
      return next
    })
  }, [rows])

  function updateDraft(rowIndex: number, patch: Partial<FailedRowDraft>) {
    setDrafts((current) => {
      const base = current[rowIndex] ?? draftFromRow(rows.find((r) => r.rowIndex === rowIndex)!)
      return { ...current, [rowIndex]: { ...base, ...patch } }
    })
  }

  async function saveRow(row: CsvImportRow): Promise<CsvImportRow | null> {
    const draft = drafts[row.rowIndex] ?? draftFromRow(row)
    setSavingIndex(row.rowIndex)
    setRowError(null)
    try {
      const { data } = await api.patch<CsvImportRow>(`/stores/${slug}/csv-imports/${importId}/rows/${row.rowIndex}`, {
        name: draft.name,
        set: draft.set,
        collectorNumber: draft.collectorNumber,
        quantity: draft.quantity,
        condition: draft.condition,
        isFoil: draft.isFoil,
      })
      onSaved()
      return data
    } catch (err) {
      const detail =
        (err as { response?: { data?: { detail?: string } }; message?: string }).response?.data?.detail ??
        (err as { message?: string }).message ??
        'Could not save row.'
      setRowError(`Row ${row.rowIndex + 1}: ${detail}`)
      return null
    } finally {
      setSavingIndex(null)
    }
  }

  async function resolveRow(row: CsvImportRow) {
    const saved = await saveRow(row)
    if (saved) onRecover({ ...row, ...saved })
  }

  return (
    <div className="max-h-[32rem] overflow-auto">
      {rowError && (
        <p role="alert" className="border-b border-danger-200 bg-danger-50 px-4 py-2 text-sm text-danger-700">
          {rowError}
        </p>
      )}
      <Table>
        <THead>
          <TR className="hover:bg-transparent">
            <TH>Matched card</TH>
            <TH>Name</TH>
            <TH>Set</TH>
            <TH>Collector</TH>
            <TH>Qty</TH>
            <TH>Market price</TH>
            <TH>Condition</TH>
            <TH>Foil</TH>
            <TH>Status</TH>
            <TH>Actions</TH>
          </TR>
        </THead>
        <TBody>
          {rows.map((row) => {
            const draft = drafts[row.rowIndex] ?? draftFromRow(row)
            const busy = savingIndex === row.rowIndex
            return (
              <TR key={row.rowIndex}>
                <TD>
                  {row.card ? (
                    <div className="flex min-w-40 items-center gap-2">
                      {cardImage(row.card) && (
                        <img src={cardImage(row.card)} alt={row.card.name} className="h-10 rounded-btn" />
                      )}
                      <span className="text-sm font-medium text-fg">{row.card.name}</span>
                    </div>
                  ) : (
                    <span className="text-fg-muted">Pending match</span>
                  )}
                </TD>
                <TD>
                  <input
                    className="w-44 rounded-btn border border-border bg-surface px-2 py-1 text-sm text-fg"
                    value={draft.name}
                    onChange={(e) => updateDraft(row.rowIndex, { name: e.target.value })}
                    disabled={busy}
                  />
                </TD>
                <TD>
                  <input
                    className="w-24 rounded-btn border border-border bg-surface px-2 py-1 text-sm uppercase text-fg"
                    value={draft.set}
                    onChange={(e) => updateDraft(row.rowIndex, { set: e.target.value })}
                    disabled={busy}
                  />
                </TD>
                <TD>
                  <input
                    className="w-16 rounded-btn border border-border bg-surface px-2 py-1 text-sm text-fg"
                    value={draft.collectorNumber}
                    onChange={(e) => updateDraft(row.rowIndex, { collectorNumber: e.target.value })}
                    disabled={busy}
                  />
                </TD>
                <TD>
                  <input
                    type="number"
                    min={0}
                    className="w-16 rounded-btn border border-border bg-surface px-2 py-1 text-sm text-fg"
                    value={draft.quantity}
                    onChange={(e) => updateDraft(row.rowIndex, { quantity: Number(e.target.value) })}
                    disabled={busy}
                  />
                </TD>
                <TD>{rowMarketPrice(row)}</TD>
                <TD>
                  <select
                    className="rounded-btn border border-border bg-surface px-2 py-1 text-sm text-fg"
                    value={draft.condition}
                    onChange={(e) => updateDraft(row.rowIndex, { condition: e.target.value })}
                    disabled={busy}
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
                    onChange={(e) => updateDraft(row.rowIndex, { isFoil: e.target.value === 'yes' })}
                    disabled={busy}
                  >
                    <option value="no">No</option>
                    <option value="yes">Yes</option>
                  </select>
                </TD>
                <TD>
                  <RowStatus row={row} />
                </TD>
                <TD>
                  <div className="flex flex-wrap gap-2">
                    <Button variant="secondary" size="sm" loading={busy} onClick={() => void saveRow(row)}>
                      Save
                    </Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      loading={busy}
                      onClick={() => void resolveRow(row)}
                      title="Save edits, then search the catalog and add to inventory"
                    >
                      <Search aria-hidden className="size-4" />
                      Resolve
                    </Button>
                  </div>
                </TD>
              </TR>
            )
          })}
          {rows.length === 0 && <EmptyRow colSpan={10}>No cards to display.</EmptyRow>}
        </TBody>
      </Table>
    </div>
  )
}

export { CONDITIONS }
