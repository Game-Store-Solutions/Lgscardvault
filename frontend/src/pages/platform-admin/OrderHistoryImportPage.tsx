import { useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { Download, FileSpreadsheet, Upload } from 'lucide-react'
import api, { extractErrorMessage, unwrapCollection } from '../../api/client'
import type { AdminOrderHistoryImportResult, Store } from '../../api/types'
import { Button, Field, PageHeader, Select } from '../../components/ui'
import { cx } from '../../lib/cx'

const TEMPLATE_CSV = [
  'customerEmail,customerName,orderId,date,type,fulfillmentMethod,paymentStatus,status,itemCount,shippingCost,tax,total,refunded,netTotal,items,trackingNumber,shippingAddress',
  'jane@example.com,Jane,KSK-0001,2026-05-24,Kiosk,Pickup,Due at Pickup,Delivered,1,0.00,0.00,4.18,0.00,4.18,"1x Sol Ring (c21) (Uncommon)",,',
].join('\n')

const TEMPLATE_HREF = `data:text/csv;charset=utf-8,${encodeURIComponent(TEMPLATE_CSV)}`

export default function OrderHistoryImportPage() {
  const [file, setFile] = useState<File | null>(null)
  const [storeSlug, setStoreSlug] = useState('')
  const [result, setResult] = useState<AdminOrderHistoryImportResult | null>(null)

  const storesQuery = useQuery({
    queryKey: ['admin-stores'],
    queryFn: async () => {
      const { data } = await api.get('/admin/stores')
      return unwrapCollection<Store>(data)
    },
  })
  const stores = storesQuery.data ?? []

  const importMutation = useMutation({
    mutationFn: async (dryRun: boolean) => {
      if (!file) throw new Error('Choose a CSV file first.')
      if (!storeSlug) throw new Error('Choose a destination store.')
      const body = new FormData()
      body.append('file', file)
      body.append('storeSlug', storeSlug)
      body.append('dryRun', dryRun ? '1' : '0')
      const { data } = await api.post<AdminOrderHistoryImportResult>('/admin/orders/import-history', body)
      return data
    },
    onSuccess: (data) => setResult(data),
  })

  const relinkMutation = useMutation({
    mutationFn: async () => {
      if (!storeSlug) throw new Error('Choose a destination store.')
      const { data } = await api.post<{
        storeSlug: string
        examined: number
        linked: number
        unmatched?: number
        samples?: string[]
      }>('/admin/orders/relink-cards', { storeSlug })
      return data
    },
  })

  return (
    <div className="space-y-6">
      <PageHeader
        title="Import order history"
        subtitle="Bring legacy customer orders into a store. Matching platform users (same email) see them in their account history automatically."
      />

      <div className="space-y-5 rounded-card border border-border bg-surface px-4 py-5 sm:px-6">
        <p className="text-sm leading-relaxed text-fg-muted">
          Export from the old site as CSV (not .xlsx). Inventory is never touched — lines are historical only.
          Existing order references are skipped on re-import. Card names like{' '}
          <code className="rounded-btn bg-bg px-1.5 py-0.5 text-brand-600">Sol Ring (c21)</code> are matched to
          the catalog so customer history shows card art.
        </p>

        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-fg-muted">
            Required columns:{' '}
            <code className="rounded-btn bg-bg px-1.5 py-0.5 text-brand-600">
              customerEmail, orderId, date, status, total, items
            </code>
          </p>
          <a
            href={TEMPLATE_HREF}
            download="order-history-import-template.csv"
            className="inline-flex items-center gap-1.5 text-xs font-bold text-brand-600 hover:text-brand-700 hover:underline"
          >
            <Download aria-hidden className="size-3.5" />
            Download sample CSV
          </a>
        </div>

        <Select
          label="Destination store"
          value={storeSlug}
          onChange={(event) => setStoreSlug(event.target.value)}
          hint="Orders are attributed to this store and linked by customer email."
        >
          <option value="">Select a store…</option>
          {stores.map((store) => (
            <option key={store.id} value={store.slug}>
              {store.name} ({store.slug})
            </option>
          ))}
        </Select>

        <Field label="CSV file" hint="Up to 5,000 orders. Status values like Delivered / Cancelled / Ready for Pickup are mapped automatically.">
          {({ id }) => (
            <label
              htmlFor={id}
              className={cx(
                'flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border bg-bg px-4 py-8 text-center transition-colors',
                'hover:border-brand-500/50 hover:bg-brand-500/5',
              )}
            >
              <FileSpreadsheet aria-hidden className="size-8 text-fg-muted" />
              <span className="text-sm font-medium text-fg">{file ? file.name : 'Choose CSV file'}</span>
              <span className="text-xs text-fg-muted">Drop or click to upload</span>
              <input
                id={id}
                type="file"
                accept=".csv,text/csv"
                className="sr-only"
                onChange={(event) => {
                  setFile(event.target.files?.[0] ?? null)
                  setResult(null)
                  importMutation.reset()
                }}
              />
            </label>
          )}
        </Field>

        <div className="flex flex-wrap gap-2">
          <Button
            variant="secondary"
            disabled={!file || !storeSlug}
            loading={importMutation.isPending && importMutation.variables === true}
            onClick={() => importMutation.mutate(true)}
          >
            Preview
          </Button>
          <Button
            disabled={!file || !storeSlug}
            loading={importMutation.isPending && importMutation.variables === false}
            onClick={() => importMutation.mutate(false)}
          >
            <Upload aria-hidden className="size-4" />
            Import orders
          </Button>
          <Button
            variant="secondary"
            disabled={!storeSlug}
            loading={relinkMutation.isPending}
            onClick={() => relinkMutation.mutate()}
          >
            Relink card images
          </Button>
        </div>

        {importMutation.isError ? (
          <p role="alert" className="text-sm font-medium text-danger-700">
            {extractErrorMessage(importMutation.error, 'Could not import that CSV.')}
          </p>
        ) : null}
        {relinkMutation.isError ? (
          <p role="alert" className="text-sm font-medium text-danger-700">
            {extractErrorMessage(relinkMutation.error, 'Could not relink order card images.')}
          </p>
        ) : null}
        {relinkMutation.isSuccess ? (
          <div className="space-y-1 text-sm text-fg">
            <p>
              Relinked <span className="font-semibold tabular-nums">{relinkMutation.data.linked}</span> of{' '}
              <span className="font-semibold tabular-nums">{relinkMutation.data.examined}</span> order lines
              without art
              {typeof relinkMutation.data.unmatched === 'number' && relinkMutation.data.unmatched > 0
                ? ` · ${relinkMutation.data.unmatched} still unmatched (not in catalog)`
                : ''}
              .
            </p>
            {(relinkMutation.data.samples?.length ?? 0) > 0 ? (
              <p className="text-xs text-fg-muted">
                Examples still unmatched: {relinkMutation.data.samples!.slice(0, 4).join(' · ')}
              </p>
            ) : null}
          </div>
        ) : null}

        {result ? (
          <div className="space-y-3 rounded-xl border border-border bg-bg px-4 py-4 text-sm">
            <p className="font-semibold text-fg">
              {result.dryRun ? 'Preview' : 'Import complete'} · /{result.storeSlug}
            </p>
            <dl className="grid gap-2 sm:grid-cols-2">
              <div>
                <dt className="text-xs uppercase tracking-wide text-fg-muted">
                  {result.dryRun ? 'Would import' : 'Imported'}
                </dt>
                <dd className="font-semibold tabular-nums text-fg">{result.imported}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wide text-fg-muted">Skipped (already present)</dt>
                <dd className="font-semibold tabular-nums text-fg">{result.skipped}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wide text-fg-muted">Matched users</dt>
                <dd className="font-semibold tabular-nums text-fg">{result.matchedUsers}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wide text-fg-muted">Orders linked to users</dt>
                <dd className="font-semibold tabular-nums text-fg">{result.matchedOrders}</dd>
              </div>
              {!result.dryRun && typeof result.cardsLinked === 'number' ? (
                <div>
                  <dt className="text-xs uppercase tracking-wide text-fg-muted">Card images linked</dt>
                  <dd className="font-semibold tabular-nums text-fg">{result.cardsLinked}</dd>
                </div>
              ) : null}
            </dl>
            {result.errors.length > 0 ? (
              <div>
                <p className="font-medium text-danger-700">Row errors ({result.errors.length})</p>
                <ul className="mt-1 max-h-40 list-disc space-y-1 overflow-y-auto pl-5 text-fg-muted">
                  {result.errors.slice(0, 20).map((issue) => (
                    <li key={`${issue.row}-${issue.message}`}>
                      Row {issue.row}
                      {issue.orderId ? ` (${issue.orderId})` : ''}: {issue.message}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            {result.warnings.length > 0 ? (
              <div>
                <p className="font-medium text-fg">Warnings (showing {Math.min(50, result.warnings.length)})</p>
                <ul className="mt-1 max-h-32 list-disc space-y-1 overflow-y-auto pl-5 text-fg-muted">
                  {result.warnings.slice(0, 10).map((issue) => (
                    <li key={`${issue.row}-${issue.message}`}>
                      Row {issue.row}
                      {issue.orderId ? ` (${issue.orderId})` : ''}: {issue.message}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  )
}
