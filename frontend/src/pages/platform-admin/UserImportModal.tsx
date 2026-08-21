import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { Download, FileSpreadsheet, Upload } from 'lucide-react'
import api, { extractErrorMessage } from '../../api/client'
import type { AdminUserImportResult } from '../../api/types'
import { Button, Field, Modal } from '../../components/ui'
import { cx } from '../../lib/cx'

const TEMPLATE_CSV = [
  'email,displayName,password,roles,emailVerified',
  'jane@example.com,Jane Doe,,ROLE_USER,true',
  'owner@example.com,Shop Owner,,ROLE_STORE_OWNER,true',
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
  const [sendResetEmails, setSendResetEmails] = useState(true)
  const [allowPlatformAdmins, setAllowPlatformAdmins] = useState(false)
  const [result, setResult] = useState<AdminUserImportResult | null>(null)

  function resetState() {
    setFile(null)
    setSendResetEmails(true)
    setAllowPlatformAdmins(false)
    setResult(null)
    importMutation.reset()
  }

  const importMutation = useMutation({
    mutationFn: async (dryRun: boolean) => {
      if (!file) throw new Error('Choose a CSV file first.')
      const body = new FormData()
      body.append('file', file)
      body.append('dryRun', dryRun ? '1' : '0')
      body.append('sendResetEmails', sendResetEmails ? '1' : '0')
      body.append('allowPlatformAdmins', allowPlatformAdmins ? '1' : '0')
      const { data } = await api.post<AdminUserImportResult>('/admin/users/import', body, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
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
            {result && !result.dryRun ? 'Done' : 'Cancel'}
          </Button>
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
      }
    >
      <div className="space-y-5">
        <p className="text-sm leading-relaxed text-fg-muted">
          Bring shoppers over from a previous site. Old password hashes cannot be reused — leave
          the password column blank and we will email a one-hour reset link (or they can use Forgot
          password). Existing emails on this platform are skipped.
        </p>

        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-fg-muted">
            Columns:{' '}
            <code className="rounded-btn bg-bg px-1.5 py-0.5 text-brand-600">
              email, displayName, password, roles, emailVerified
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

        <Field label="CSV file" hint="Up to 2,000 rows. First and last name columns are also accepted.">
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
          />
          <span>
            <span className="block text-sm font-semibold text-fg">Email password-reset links</span>
            <span className="block text-xs text-fg-muted">
              Sent only for rows without a password, up to 200 per import. Everyone else can use Forgot
              password on the login page.
            </span>
          </span>
        </label>

        <label className="flex items-start gap-3 rounded-card border border-border p-3">
          <input
            type="checkbox"
            checked={allowPlatformAdmins}
            onChange={(event) => setAllowPlatformAdmins(event.target.checked)}
            className="mt-1 size-4 accent-brand-500"
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
  const issues = [...result.errors, ...result.warnings]

  return (
    <div className="space-y-3 rounded-card border border-border bg-bg/60 p-4">
      <p className="text-sm font-bold text-fg">
        {result.dryRun ? 'Preview' : 'Import complete'}
        {': '}
        {result.created} {result.dryRun ? 'would be created' : 'created'}
        {', '}
        {result.skipped} skipped
        {result.resetEmailsSent > 0
          ? result.dryRun
            ? `, ${result.resetEmailsSent} would get reset emails`
            : `, ${result.resetEmailsSent} reset emails sent`
          : ''}
        {result.resetEmailsOmitted > 0 ? `, ${result.resetEmailsOmitted} reset emails omitted` : ''}
        .
      </p>
      {issues.length > 0 && (
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
