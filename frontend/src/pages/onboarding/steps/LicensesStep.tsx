import { CheckCircle2, FileText, ShieldCheck, Upload } from 'lucide-react'
import { useRef, useState } from 'react'
import api, { extractErrorMessage } from '../../../api/client'
import type { ComplianceDocumentMeta } from '../../../api/types'
import { Button, Input, Select } from '../../../components/ui'
import { NO_STATE_SALES_TAX } from '../config'
import type { OnboardingCompliance, OnboardingData, Patch } from '../types'

const ENTITY_OPTIONS = [
  { value: 'sole_prop', label: 'Sole proprietor' },
  { value: 'llc', label: 'LLC' },
  { value: 'corp', label: 'Corporation' },
  { value: 'partnership', label: 'Partnership' },
  { value: 'other', label: 'Other' },
] as const

const SECONDHAND_OPTIONS = [
  { value: 'not_applicable', label: 'Does not apply' },
  { value: 'will_comply', label: 'Will comply locally (not yet licensed)' },
  { value: 'licensed', label: 'Licensed — I have a permit' },
] as const

export function LicensesStep({ data, patch }: { data: OnboardingData; patch: Patch }) {
  const noTaxState = NO_STATE_SALES_TAX.includes(data.address.region.toUpperCase())
  const c = data.compliance

  function setCompliance(partial: Partial<OnboardingCompliance>) {
    patch({ compliance: { ...c, ...partial } })
  }

  return (
    <div className="max-w-2xl space-y-6">
      <p className="text-sm leading-6 text-fg-muted">
        You are the merchant of record. We are the software. A platform admin will review these
        licenses before your storefront goes live. There is no 50-state permit API — California
        admins get a CDTFA lookup link; you still upload or type the number.
      </p>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <Input
            label="Legal business name"
            value={c.legalBusinessName}
            onChange={(e) => setCompliance({ legalBusinessName: e.target.value })}
            required
          />
        </div>
        <Select
          label="Entity type"
          value={c.entityType}
          onChange={(e) => setCompliance({ entityType: e.target.value as OnboardingCompliance['entityType'] })}
          required
        >
          <option value="">Select…</option>
          {ENTITY_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </Select>
        <Input
          label="EIN (optional)"
          hint="Digits only. Used for admin review, not displayed to shoppers."
          value={c.ein}
          onChange={(e) => setCompliance({ ein: e.target.value.replace(/[^\d-]/g, '').slice(0, 20) })}
          inputMode="numeric"
          autoComplete="off"
        />
      </div>

      {noTaxState ? (
        <label className="flex items-start gap-2 rounded-card border border-border bg-surface p-4 text-sm leading-6 text-fg">
          <input
            type="checkbox"
            className="mt-1 size-4 accent-current"
            checked={c.noStateSalesTax}
            onChange={(e) => setCompliance({ noStateSalesTax: e.target.checked })}
            required
          />
          <span>
            My store is in {data.address.region}, which has no statewide sales tax. I still configure
            any local Square tax that applies.
          </span>
        </label>
      ) : (
        <div className="space-y-3">
          <Input
            label="Seller’s permit / sales-tax license number"
            hint="Required unless you upload the permit document below."
            value={c.sellerPermitNumber}
            onChange={(e) => setCompliance({ sellerPermitNumber: e.target.value })}
          />
          <DocumentUpload
            kind="seller_permit"
            label="Upload seller’s permit"
            documents={data.complianceDocuments}
            onUploaded={(doc) => patch({ complianceDocuments: [...data.complianceDocuments, doc] })}
          />
        </div>
      )}

      <div className="space-y-3">
        <Input
          label="City business license number (optional)"
          value={c.cityLicenseNumber}
          onChange={(e) => setCompliance({ cityLicenseNumber: e.target.value })}
        />
        <DocumentUpload
          kind="city_license"
          label="Upload city / local business license"
          documents={data.complianceDocuments}
          onUploaded={(doc) => patch({ complianceDocuments: [...data.complianceDocuments, doc] })}
        />
      </div>

      <label className="flex items-start gap-2 rounded-card border border-border bg-surface p-4 text-sm leading-6 text-fg">
        <input
          type="checkbox"
          className="mt-1 size-4 accent-current"
          checked={c.usesBuyTrade}
          onChange={(e) =>
            setCompliance({
              usesBuyTrade: e.target.checked,
              secondhandStatus: e.target.checked ? c.secondhandStatus : 'not_applicable',
            })
          }
        />
        <span>This store buys or trades cards from the public (buylist / pawn / secondhand).</span>
      </label>

      {c.usesBuyTrade && (
        <div className="space-y-3">
          <Select
            label="Secondhand-dealer / pawn status"
            value={c.secondhandStatus}
            onChange={(e) =>
              setCompliance({ secondhandStatus: e.target.value as OnboardingCompliance['secondhandStatus'] })
            }
            required
          >
            {SECONDHAND_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </Select>
          {c.secondhandStatus === 'licensed' && (
            <>
              <Input
                label="Secondhand / pawn license number"
                value={c.secondhandLicenseNumber}
                onChange={(e) => setCompliance({ secondhandLicenseNumber: e.target.value })}
              />
              <DocumentUpload
                kind="secondhand"
                label="Upload secondhand-dealer license"
                documents={data.complianceDocuments}
                onUploaded={(doc) => patch({ complianceDocuments: [...data.complianceDocuments, doc] })}
              />
            </>
          )}
        </div>
      )}

      <label className="flex items-start gap-2 rounded-card border border-border bg-surface p-4 text-sm leading-6 text-fg">
        <input
          type="checkbox"
          className="mt-1 size-4 accent-current"
          checked={c.insuranceAttested}
          onChange={(e) => setCompliance({ insuranceAttested: e.target.checked })}
          required
        />
        <span className="flex items-start gap-2">
          <ShieldCheck aria-hidden className="mt-0.5 size-4 shrink-0 text-brand-600" />
          I carry business insurance appropriate for an in-person retail shop (general liability at
          minimum). Forming the legal entity, EIN with the IRS, and a registered agent are my
          responsibility as the store owner — not the platform’s.
        </span>
      </label>
    </div>
  )
}

function DocumentUpload({
  kind,
  label,
  documents,
  onUploaded,
}: {
  kind: ComplianceDocumentMeta['kind']
  label: string
  documents: ComplianceDocumentMeta[]
  onUploaded: (doc: ComplianceDocumentMeta) => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const existing = documents.filter((d) => d.kind === kind)

  async function upload(file: File) {
    setBusy(true)
    setError('')
    try {
      const form = new FormData()
      form.append('kind', kind)
      form.append('file', file)
      const { data } = await api.post<ComplianceDocumentMeta>('/compliance-documents', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      onUploaded(data)
    } catch (e) {
      setError(extractErrorMessage(e, 'Could not upload that file.'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div>
      <p className="text-xs font-bold uppercase tracking-wide text-fg-muted">{label}</p>
      <p className="mt-1 text-xs text-fg-muted">PDF, JPEG, PNG, or WebP · 8 MB max. Stored privately, not on the public site.</p>
      {existing.map((doc) => (
        <p key={doc.id} className="mt-2 flex items-center gap-2 text-sm text-success-700">
          <CheckCircle2 aria-hidden className="size-4" />
          <FileText aria-hidden className="size-4" />
          {doc.originalFilename}
        </p>
      ))}
      <input
        ref={inputRef}
        type="file"
        accept="application/pdf,image/jpeg,image/png,image/webp"
        className="hidden"
        aria-label={label}
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) void upload(file)
          e.target.value = ''
        }}
      />
      <Button
        type="button"
        variant="secondary"
        size="sm"
        className="mt-2"
        loading={busy}
        onClick={() => inputRef.current?.click()}
      >
        <Upload aria-hidden className="size-4" />
        {existing.length ? 'Upload another' : 'Upload file'}
      </Button>
      {error && (
        <p role="alert" className="mt-2 text-sm font-medium text-danger-700">
          {error}
        </p>
      )}
    </div>
  )
}

export default LicensesStep
