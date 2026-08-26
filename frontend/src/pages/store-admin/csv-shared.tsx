/* eslint-disable react-refresh/only-export-components */
import { Badge } from '../../components/ui'
import { formatPrice, scryfallPriceCents } from '../../api/client'
import type { BadgeProps } from '../../components/ui'
import type { CsvImportJobStatus, CsvImportRow } from '../../api/types'

/** True when a job is still doing work (drives polling intervals + upload gating). */
export function isActive(status: CsvImportJobStatus | null | undefined): boolean {
  return status === 'queued' || status === 'processing'
}

/** Map a run status to a design-system Badge tone. */
const STATUS_TONE: Record<CsvImportJobStatus, BadgeProps['tone']> = {
  queued: 'neutral',
  processing: 'brand',
  completed: 'success',
  failed: 'danger',
  paused: 'warning',
  cancelled: 'neutral',
}

/** Shared run-status badge used by CsvTab and ImportRunDetailsPage. */
export function RunStatusBadge({ status }: { status: CsvImportJobStatus }) {
  const label = status === 'completed' ? 'succeeded' : status
  return (
    <Badge tone={STATUS_TONE[status]} className="uppercase">
      {label}
    </Badge>
  )
}

/** Formatted market price preview for a single import row. */
export function rowMarketPrice(row: CsvImportRow): string {
  if (!row.card) return '-'
  const cents = scryfallPriceCents(row.card, row.isFoil ? 'foil' : 'nonfoil')
  return cents === null ? '-' : formatPrice(cents)
}

/** Rows the operator skipped during recovery (derived if the API omits it). */
export function skippedRowCount(job: {
  processedRows: number
  importedRows: number
  failedRows: number
  skippedRows?: number
}): number {
  if (typeof job.skippedRows === 'number') return job.skippedRows
  return Math.max(0, job.processedRows - job.importedRows - job.failedRows)
}

/** Failed or skipped rows that still belong in the /fix workspace. */
export function canOpenRecovery(job: {
  status: CsvImportJobStatus
  failedRows: number
  processedRows: number
  importedRows: number
  skippedRows?: number
}): boolean {
  return !isActive(job.status) && job.status !== 'cancelled' && (job.failedRows > 0 || skippedRowCount(job) > 0)
}

/** Small metric tile (label + toned value) used in CSV import summaries. */
export function ImportStat({
  label,
  value,
  tone = 'neutral',
}: {
  label: string
  value: string
  tone?: 'neutral' | 'success' | 'danger'
}) {
  const valueTone = tone === 'success' ? 'text-success-700' : tone === 'danger' ? 'text-danger-700' : 'text-fg'
  return (
    <div data-guide={label} className="rounded-card border border-border bg-bg p-3">
      <p className="text-xs font-bold uppercase tracking-wide text-fg-muted">{label}</p>
      <p className={`mt-1 text-xl font-bold ${valueTone}`}>{value}</p>
    </div>
  )
}
