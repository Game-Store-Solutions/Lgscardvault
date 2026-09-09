import { useMemo, useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { CheckCircle2, Download, FileSpreadsheet, Layers, Package, Upload, XCircle } from 'lucide-react'
import api, { extractErrorMessage, formatPrice } from '../../api/client'
import type { CsvImportJob, ImportPreview, ImportPreviewRow } from '../../api/types'
import {
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  LoadingPanel,
  Table,
  TBody,
  TD,
  TH,
  THead,
  TR,
} from '../../components/ui'
import { useCatalogGames } from '../../hooks'
import { GameSelector } from '../../components/catalog'
import { cx } from '../../lib/cx'

type ImportType = 'cards' | 'sealed'

const CARD_HEADERS = 'name, game, set, condition, foil, rarity, quantity, variant, collectorNumber'
const SEALED_HEADERS = 'name, quantity (price, productId, set optional)'

const STEPS = ['Game', 'Type', 'Upload', 'Preview', 'Import'] as const

/**
 * Guided import: pick the game and what you're importing, upload the sheet,
 * see a dry-run preview of how rows resolve against that game's catalog,
 * then commit. Nothing is written until the final step.
 */
export default function ImportWizard({
  slug,
  busy,
  onImported,
}: {
  slug: string
  /** True while a previous import is still running — blocks starting another. */
  busy: boolean
  onImported: () => void
}) {
  const { data: games = [] } = useCatalogGames()
  const [gameCode, setGameCode] = useState('')
  const [importType, setImportType] = useState<ImportType | ''>('')
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<ImportPreview | null>(null)
  const [error, setError] = useState<string | null>(null)

  const reset = () => {
    setFile(null)
    setPreview(null)
    setError(null)
  }

  const previewMutation = useMutation({
    mutationFn: async (chosen: File) => {
      const body = new FormData()
      body.append('file', chosen)
      body.append('game', gameCode)
      body.append('type', importType || 'cards')
      const { data } = await api.post<ImportPreview>(`/stores/${slug}/csv-imports/preview`, body, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      return data
    },
    onMutate: () => setError(null),
    onSuccess: (data) => setPreview(data),
    onError: (err) => {
      setPreview(null)
      setError(extractErrorMessage(err, 'Could not read that CSV.'))
    },
  })

  const importMutation = useMutation({
    mutationFn: async () => {
      if (!file) throw new Error('No file selected.')
      const body = new FormData()
      body.append('file', file)
      body.append('game', gameCode)
      body.append('type', importType || 'cards')
      const { data } = await api.post<CsvImportJob>(`/stores/${slug}/csv-imports`, body, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      return data
    },
    onMutate: () => setError(null),
    onSuccess: () => {
      reset()
      onImported()
    },
    onError: (err) => setError(extractErrorMessage(err, 'Upload failed.')),
  })

  // Current step drives the progress rail: each one unlocks the next.
  const step = useMemo(() => {
    if (!gameCode) return 0
    if (!importType) return 1
    if (!file) return 2
    if (!preview) return 3
    return 4
  }, [gameCode, importType, file, preview])

  const sealed = 'sealed' === importType

  return (
    <Card>
      <CardHeader
        title="Import inventory"
        subtitle="Pick a game and what you're importing, upload the sheet, review the preview, then import."
      />
      <CardBody className="space-y-6">
        {/* Progress rail */}
        <ol className="flex flex-wrap items-center gap-2 text-xs font-bold">
          {STEPS.map((label, index) => (
            <li key={label} className="flex items-center gap-2">
              <span
                className={cx(
                  'grid size-6 place-items-center rounded-full border',
                  index < step
                    ? 'border-brand-500 bg-brand-500 text-white'
                    : index === step
                      ? 'border-brand-500 text-brand-600'
                      : 'border-border text-fg-muted',
                )}
              >
                {index + 1}
              </span>
              <span className={index <= step ? 'text-fg' : 'text-fg-muted'}>{label}</span>
              {index < STEPS.length - 1 && <span aria-hidden className="text-fg-muted">→</span>}
            </li>
          ))}
        </ol>

        {/* Step 1. Game */}
        <section className="space-y-2">
          <h3 className="text-sm font-bold text-fg">1. Which game?</h3>
          <GameSelector
            games={games.map((game) => ({ code: game.code, name: game.name }))}
            value={gameCode}
            onChange={(code) => {
              setGameCode(code)
              reset()
            }}
            label="Import for"
          />
        </section>

        {/* Step 2. Type */}
        {gameCode && (
          <section className="space-y-2">
            <h3 className="text-sm font-bold text-fg">2. What are you importing?</h3>
            <div className="grid gap-3 sm:grid-cols-2">
              <TypeCard
                icon={Layers}
                title="Singles"
                description="Individual cards, with condition and foil."
                active={'cards' === importType}
                onClick={() => {
                  setImportType('cards')
                  reset()
                }}
              />
              <TypeCard
                icon={Package}
                title="Sealed products"
                description="Booster boxes, bundles, and decks."
                active={sealed}
                onClick={() => {
                  setImportType('sealed')
                  reset()
                }}
              />
            </div>
          </section>
        )}

        {/* Step 3. Upload */}
        {gameCode && importType && (
          <section className="space-y-2">
            <h3 className="text-sm font-bold text-fg">3. Upload your CSV</h3>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs text-fg-muted">
                Columns: <code className="rounded-btn bg-bg px-1.5 py-0.5 text-brand-600">{sealed ? SEALED_HEADERS : CARD_HEADERS}</code>
              </p>
              {/* Matched to the chosen game and type, so the example rows are
                  in that game's own conventions. */}
              <a
                href={`/api/catalog/games/${gameCode}/import-template?type=${sealed ? 'sealed' : 'cards'}`}
                download
                className="inline-flex items-center gap-1.5 text-xs font-bold text-brand-600 hover:text-brand-700 hover:underline"
              >
                <Download aria-hidden className="size-3.5" />
                Download {games.find((game) => game.code === gameCode)?.name ?? ''} sample CSV
              </a>
            </div>
            <label
              className={cx(
                'flex cursor-pointer items-center justify-center gap-2 rounded-btn border border-dashed border-border bg-bg px-4 py-6 text-sm font-bold text-fg-muted hover:text-fg',
                previewMutation.isPending && 'pointer-events-none opacity-50',
              )}
            >
              <Upload aria-hidden className="size-4" />
              {file ? file.name : 'Choose a CSV file'}
              <input
                type="file"
                accept=".csv,text/csv"
                className="sr-only"
                onChange={(event) => {
                  const chosen = event.target.files?.[0]
                  event.target.value = ''
                  if (!chosen) return
                  setFile(chosen)
                  setPreview(null)
                  previewMutation.mutate(chosen)
                }}
              />
            </label>
          </section>
        )}

        {/* Step 4. Preview */}
        {previewMutation.isPending && <LoadingPanel label="Validating your sheet…" />}
        {preview && (
          <section className="space-y-3">
            <h3 className="text-sm font-bold text-fg">4. Preview</h3>
            <div className="grid gap-3 sm:grid-cols-4">
              <PreviewStat label="Rows" value={String(preview.totalRows)} />
              <PreviewStat label="Total quantity" value={String(preview.totalQuantity)} />
              <PreviewStat label="Matched in sample" value={`${preview.matchedRows}/${preview.sampleSize}`} tone="success" />
              <PreviewStat
                label="Invalid rows"
                value={String(preview.invalidRows)}
                tone={preview.invalidRows > 0 ? 'danger' : undefined}
              />
            </div>

            {preview.sampleSize < preview.totalRows && (
              <p className="text-xs text-fg-muted">
                Showing the first {preview.sampleSize} of {preview.totalRows} rows. The rest resolve during the import.
              </p>
            )}

            <div className="max-h-96 overflow-auto rounded-card border border-border">
              <Table>
                <THead>
                  <TR className="hover:bg-transparent">
                    <TH>Row</TH>
                    <TH>From your sheet</TH>
                    <TH>Matched in catalog</TH>
                    <TH>Qty</TH>
                    {sealed && <TH>Price</TH>}
                    <TH>Status</TH>
                  </TR>
                </THead>
                <TBody>
                  {preview.sample.map((row) => (
                    <PreviewRow key={row.rowIndex} row={row} sealed={sealed} />
                  ))}
                </TBody>
              </Table>
            </div>

            {preview.matchedRows === 0 && (
              <p className="text-sm text-warning-700">
                Nothing in this sample matched the catalog. Check the game and column names. For non-Magic games the
                catalog needs a TCGCSV sync first.
              </p>
            )}
          </section>
        )}

        {error && (
          <p role="alert" className="text-sm font-medium text-danger-700">
            {error}
          </p>
        )}

        {/* Step 5. Import */}
        {preview && (
          <div className="flex flex-wrap items-center gap-3">
            <Button onClick={() => importMutation.mutate()} disabled={busy || importMutation.isPending}>
              <FileSpreadsheet aria-hidden className="size-4" />
              {importMutation.isPending ? 'Starting import…' : `Import ${preview.totalRows} rows`}
            </Button>
            <Button variant="secondary" onClick={reset} disabled={importMutation.isPending}>
              Choose a different file
            </Button>
            {busy && <span className="text-sm text-fg-muted">Another import is still running.</span>}
          </div>
        )}
      </CardBody>
    </Card>
  )
}

function TypeCard({
  icon: Icon,
  title,
  description,
  active,
  onClick,
}: {
  icon: typeof Layers
  title: string
  description: string
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cx(
        'flex items-start gap-3 rounded-card border p-4 text-left transition-colors',
        active ? 'border-brand-500 bg-brand-50' : 'border-border bg-surface hover:border-brand-300',
      )}
    >
      <span
        className={cx(
          'grid size-9 shrink-0 place-items-center rounded-btn',
          active ? 'bg-brand-500 text-white' : 'bg-bg text-fg-muted',
        )}
      >
        <Icon aria-hidden className="size-4" />
      </span>
      <span>
        <span className="block font-bold text-fg">{title}</span>
        <span className="block text-xs text-fg-muted">{description}</span>
      </span>
    </button>
  )
}

function PreviewStat({ label, value, tone }: { label: string; value: string; tone?: 'success' | 'danger' }) {
  return (
    <div className="rounded-card border border-border bg-surface px-3 py-2">
      <p className="text-xs text-fg-muted">{label}</p>
      <p
        className={cx(
          'font-display text-lg font-bold',
          'success' === tone ? 'text-success-700' : 'danger' === tone ? 'text-danger-700' : 'text-fg',
        )}
      >
        {value}
      </p>
    </div>
  )
}

function PreviewRow({ row, sealed }: { row: ImportPreviewRow; sealed: boolean }) {
  return (
    <TR>
      <TD className="text-fg-muted">{row.rowIndex + 1}</TD>
      <TD>
        <p className="font-medium text-fg">{row.name || <span className="text-fg-muted">(blank)</span>}</p>
        <p className="text-xs text-fg-muted">
          {[row.set, row.collectorNumber && `#${row.collectorNumber}`, !sealed && row.isFoil ? (row.finish ?? 'Foil') : '']
            .filter(Boolean)
            .join(' · ')}
        </p>
      </TD>
      <TD>
        {row.matchedName ? (
          <div className="flex items-center gap-2">
            {row.imageUrl && <img src={row.imageUrl} alt="" loading="lazy" className="h-10 rounded object-contain" />}
            <div>
              <p className="font-medium text-fg">{row.matchedName}</p>
              {row.matchedSet && <p className="text-xs text-fg-muted">{row.matchedSet}</p>}
            </div>
          </div>
        ) : (
          <span className="text-fg-muted">—</span>
        )}
      </TD>
      <TD>{row.quantity}</TD>
      {sealed && (
        <TD className="text-sm text-fg-muted">
          {row.priceCents != null
            ? formatPrice(row.priceCents)
            : row.marketPriceCents != null
              ? `${formatPrice(row.marketPriceCents)} (market)`
              : '—'}
        </TD>
      )}
      <TD>
        {'matched' === row.match ? (
          <Badge tone="success">
            <CheckCircle2 aria-hidden className="size-3" /> Matched
          </Badge>
        ) : 'invalid' === row.match ? (
          <span title={row.error ?? undefined}>
            <Badge tone="danger">
              <XCircle aria-hidden className="size-3" /> {row.error ?? 'Invalid'}
            </Badge>
          </span>
        ) : (
          <Badge tone="warning">Not in catalog</Badge>
        )}
      </TD>
    </TR>
  )
}
