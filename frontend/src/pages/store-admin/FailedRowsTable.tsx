import { cardImage } from '../../api/client'
import type { CsvImportRow } from '../../api/types'
import { Badge, EmptyRow, Table, TBody, TD, TH, THead, TR } from '../../components/ui'
import { rowMarketPrice } from './csv-shared'

function RowStatus({ row }: { row: CsvImportRow }) {
  if (row.status === 'skipped') return <Badge tone="neutral">Skipped</Badge>
  if (row.status === 'error') {
    return (
      <span title={row.error ?? undefined}>
        <Badge tone="danger">{row.error ?? 'Failed'}</Badge>
      </span>
    )
  }
  return <Badge tone="neutral">{row.status}</Badge>
}

/**
 * Read-only summary of the rows an import could not place.
 *
 * Editing and resolving live in the Fix failed cards workspace instead. Doing
 * both here meant every row carried a Save and a Resolve button that did
 * different things, and the sheet-shaped grid of bare inputs gave no clue
 * which field was actually wrong.
 */
export function FailedRowsTable({ rows }: { rows: CsvImportRow[] }) {
  return (
    <div className="max-h-[32rem] overflow-auto">
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
          </TR>
        </THead>
        <TBody>
          {rows.map((row) => (
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
              <TD>{row.name}</TD>
              <TD className="uppercase">{row.set}</TD>
              <TD>{row.collectorNumber}</TD>
              <TD>{row.quantity}</TD>
              <TD>{rowMarketPrice(row)}</TD>
              <TD>{row.condition}</TD>
              <TD>{row.isFoil ? 'Yes' : 'No'}</TD>
              <TD>
                <RowStatus row={row} />
              </TD>
            </TR>
          ))}
          {rows.length === 0 && <EmptyRow colSpan={9}>No cards to display.</EmptyRow>}
        </TBody>
      </Table>
    </div>
  )
}
