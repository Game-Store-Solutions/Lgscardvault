import { useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { CheckCircle2, Download, FileSpreadsheet, Upload } from 'lucide-react'
import api, { extractErrorMessage, unwrapCollection } from '../../api/client'
import type { AdminUserImportResult, Store } from '../../api/types'
import { ConfettiBurst, motion } from '../../components/motion'
import { Button, Field, Modal, Select } from '../../components/ui'
import { cx } from '../../lib/cx'

const TEMPLATE_CSV = [
  'email,displayName,password,roles,emailVerified,dateOfBirth',
  'jane@example.com,Jane Doe,,ROLE_USER,true,1991-04-12',
  'owner@example.com,Shop Owner,,ROLE_STORE_OWNER,true,1988-06-01',
].join('\n')

const TEMPLATE_HREF = `data:text/csv;charset=utf-8,${encodeURIComponent(TEMPLATE_CSV)}`

export default function UserImportModal({
  open,
  onClose,
  onImported,
}: {
  open: boolean
  onClose: () => void
  onImported: () => void
}) {
  const [file, setFile] = useState<File | null>(null)
  const [storeSlug, setStoreSlug] = useState('')
  const [sendResetEmails, setSendResetEmails] = useState(true)
  const [allowPlatformAdmins, setAllowPlatformAdmins] = useState(false)
  const [result, setResult] = useState<AdminUserImportResult | null>(null)

  const storesQuery = useQuery({
    queryKey: ['admin-stores'],
    enabled: open,
    queryFn: async () => {
      const { data } = await api.get('/admin/stores')
      return unwrapCollection<Store>(data)
    },
  })
  const stores = storesQuery.data ?? []

  function resetState() {
    setFile(null)
    setStoreSlug('')
    setSendResetEmails(true)
    setAllowPlatformAdmins(false)
    setResult(null)
    importMutation.reset()
  }

  const importFinished = Boolean(result && !result.dryRun)

  const importMutation = useMutation({
    mutationFn: async (dryRun: boolean) => {
      if (!file) throw new Error('Choose a CSV file first.')
      const body = new FormData()
      body.append('file', file)
      body.append('dryRun', dryRun ? '1' : '0')
      body.append('sendResetEmails', sendResetEmails ? '1' : '0')
      body.append('allowPlatformAdmins', allowPlatformAdmins ? '1' : '0')
      if (storeSlug) body.append('storeSlug', storeSlug)
      const { data } = await api.post<AdminUserImportResult>('/admin/users/import', body)
      return data
    },
    onSuccess: (data, dryRun) => {
      setResult(data)
      if (!dryRun) onImported()
    },
  })

  return (
    <Modal
      open={open}
      onClose={() => {
        resetState()
        onClose()
      }}
      title="Import users"
      className="max-w-2xl"
      footer={
        <>
          <Button
            variant="secondary"
            onClick={() => {
              resetState()
              onClose()
            }}
          >
            {importFinished ? 'Done' : 'Cancel'}
          </Button>
          {!importFinished ? (
            <>
              <Button
                variant="secondary"
                disabled={!file}
                loading={importMutation.isPending && importMutation.variables === true}
                onClick={() => importMutation.mutate(true)}
              >
                Preview
              </Button>
              <Button
                disabled={!file}
                loading={importMutation.isPending && importMutation.variables === false}
                onClick={() => importMutation.mutate(false)}
              >
                Import users
              </Button>
            </>
          ) : (
            <Button
              onClick={() => {
                resetState()
                onClose()
              }}
            >
              Close
            </Button>
          )}
        </>
      }
    >
      <div className="space-y-5">
        {importFinished && result ? (
          <div
            role="status"
            className="relative overflow-hidden rounded-card border border-success-700/30 bg-success-700/10 px-4 py-3"
          >
            <ConfettiBurst fire key={`confetti-${result.created}-${result.resetEmailsSent}`} />
            <motion.div
              className="relative z-[1] flex items-start gap-3"
              initial={{ opacity: 0, scale: 0.96, y: 6 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
            >
              <CheckCircle2 aria-hidden className="mt-0.5 size-5 shrink-0 text-success-700" />
              <div className="min-w-0">
                <p className="text-sm font-bold text-success-700">Import finished</p>
                <p className="mt-0.5 text-sm text-fg">
                  {result.created} user{result.created === 1 ? '' : 's'} created
                  {result.skipped > 0 ? `, ${result.skipped} skipped` : ''}
                  {result.resetEmailsSent > 0
                    ? `, ${result.resetEmailsSent} set-password email${result.resetEmailsSent === 1 ? '' : 's'} sent`
                    : ''}
                  .
                </p>
              </div>
            </motion.div>
          </div>
        ) : null}

        <p className="text-sm leading-relaxed text-fg-muted">
          Bring shoppers over from a previous site. Export the sheet as CSV (not .xlsx). Old
          password hashes cannot be reused — leave that column blank and we email a set-password
          link that stays valid until they use it. Existing emails on this platform are skipped.
        </p>

        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-fg-muted">
            Columns:{' '}
            <code className="rounded-btn bg-bg px-1.5 py-0.5 text-brand-600">
              email, displayName, password, roles, emailVerified, dateOfBirth
            </code>
          </p>
          <a
            href={TEMPLATE_HREF}
            download="user-import-template.csv"
            className="inline-flex items-center gap-1.5 text-xs font-bold text-brand-600 hover:text-brand-700 hover:underline"
          >
            <Download aria-hidden className="size-3.5" />
            Download sample CSV
          </a>
        </div>

        <Select
          label="Email branding store"
          value={storeSlug}
          onChange={(event) => setStoreSlug(event.target.value)}
          hint="Optional. Set-password emails use this store’s logo and colors. Leave blank for LGS Card Vault branding."
          disabled={importFinished}
        >
          <option value="">LGS Card Vault (platform)</option>
          {stores.map((store) => (
            <option key={store.id} value={store.slug}>
              {store.name} ({store.slug})
            </option>
          ))}
        </Select>

        <Field label="CSV file" hint="Up to 2,000 rows. First/last name, Customer Email, and spreadsheet dates (M/D/YYYY) are accepted.">
          {({ id }) => (
            <label
              htmlFor={id}
              className={cx(
                'flex cursor-pointer items-center justify-center gap-2 rounded-btn border border-dashed border-border bg-bg px-4 py-6 text-sm font-bold text-fg-muted hover:text-fg',
                importMutation.isPending && 'pointer-events-none opacity-50',
              )}
            >
              {file ? <FileSpreadsheet aria-hidden className="size-4" /> : <Upload aria-hidden className="size-4" />}
              {file ? file.name : 'Choose a CSV file'}
              <input
                id={id}
                type="file"
                accept=".csv,text/csv,.txt"
                className="sr-only"
                onChange={(event) => {
                  const chosen = event.target.files?.[0] ?? null
                  event.target.value = ''
                  setFile(chosen)
                  setResult(null)
                  importMutation.reset()
                }}
              />
            </label>
          )}
        </Field>

        <label className="flex items-start gap-3 rounded-card border border-border p-3">
          <input
            type="checkbox"
            checked={sendResetEmails}
            onChange={(event) => setSendResetEmails(event.target.checked)}
            className="mt-1 size-4 accent-brand-500"
            disabled={importFinished}
          />
          <span>
            <span className="block text-sm font-semibold text-fg">Email set-password links</span>
            <span className="block text-xs text-fg-muted">
              Sent only for rows without a password, up to 200 per import. Links stay valid until used
              (once). Forgot password on login still uses a one-hour link.
            </span>
          </span>
        </label>

        <label className="flex items-start gap-3 rounded-card border border-border p-3">
          <input
            type="checkbox"
            checked={allowPlatformAdmins}
            onChange={(event) => setAllowPlatformAdmins(event.target.checked)}
            className="mt-1 size-4 accent-brand-500"
            disabled={importFinished}
          />
          <span>
            <span className="block text-sm font-semibold text-fg">Allow platform-admin roles</span>
            <span className="block text-xs text-fg-muted">
              Off by default. A ROLE_SUPER_ADMIN column otherwise imports as a regular customer.
            </span>
          </span>
        </label>

        {importMutation.isError && (
          <p role="alert" className="text-sm text-danger-700">
            {extractErrorMessage(importMutation.error, 'Could not import that CSV.')}
          </p>
        )}

        {result && <ImportResultSummary result={result} />}
      </div>
    </Modal>
  )
}

function ImportResultSummary({ result }: { result: AdminUserImportResult }) {
  return (
    <div
      className={cx(
        'space-y-3 rounded-card border p-4',
        result.dryRun ? 'border-border bg-bg/60' : 'border-success-700/25 bg-success-700/5',
      )}
    >
      <p className={cx('flex items-center gap-2 text-sm font-bold', result.dryRun ? 'text-fg' : 'text-success-700')}>
        {!result.dryRun ? <CheckCircle2 aria-hidden className="size-4 shrink-0" /> : null}
        {result.dryRun ? 'Preview' : 'Import complete'}
        {': '}
        {result.created} {result.dryRun ? 'would be created' : 'created'}
        {', '}
        {result.skipped} skipped
        {result.resetEmailsSent > 0
          ? result.dryRun
            ? `, ${result.resetEmailsSent} would get set-password emails`
            : `, ${result.resetEmailsSent} set-password emails sent`
          : ''}
        {result.resetEmailsOmitted > 0 ? `, ${result.resetEmailsOmitted} set-password emails omitted` : ''}
        .
      </p>
      {(result.errors.length > 0 || result.warnings.length > 0) && (
        <ul className="max-h-40 space-y-1 overflow-y-auto text-xs text-fg-muted">
          {result.errors.map((issue) => (
            <li key={`error-${issue.row}-${issue.email ?? ''}`}>
              <span className="font-bold text-danger-700">Row {issue.row}</span>
              {issue.email ? ` · ${issue.email}` : ''}: {issue.message}
            </li>
          ))}
          {result.warnings.map((issue) => (
            <li key={`warn-${issue.row}-${issue.email ?? ''}`}>
              <span className="font-bold text-fg">Row {issue.row}</span>
              {issue.email ? ` · ${issue.email}` : ''}: {issue.message}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
