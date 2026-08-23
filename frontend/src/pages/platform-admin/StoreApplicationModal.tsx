import { useEffect, useState } from 'react'
import { CheckCircle2, ExternalLink, X } from 'lucide-react'
import type { Store } from '../../api/types'
import { Badge, Button, Modal, Textarea } from '../../components/ui'
import { ComplianceDocumentGallery } from './ComplianceDocumentPreview'

const COLOR_KEYS: { key: keyof Store; label: string }[] = [
  { key: 'primaryColor', label: 'Primary' },
  { key: 'accentColor', label: 'Accent' },
  { key: 'backgroundColor', label: 'Background' },
  { key: 'surfaceColor', label: 'Surface' },
  { key: 'textColor', label: 'Text' },
]

/**
 * Full detail view for a store application, with approve/reject actions. Shows
 * everything the owner submitted so an admin can make an informed decision.
 */
export function StoreApplicationModal({
  store,
  busyAction,
  error,
  onApprove,
  onReject,
  onClose,
}: {
  store: Store | null
  busyAction: 'approve' | 'reject' | null
  error?: string | null
  onApprove: (id: number) => void
  onReject: (id: number, reason: string) => void
  onClose: () => void
}) {
  const [reason, setReason] = useState('')

  // Reset the reason whenever a different application is opened.
  useEffect(() => setReason(''), [store?.id])

  if (!store) return null

  const address = [store.addressLine1, store.addressLine2, store.city, store.region, store.postalCode, store.country]
    .filter(Boolean)
    .join(', ')

  return (
    <Modal
      open={Boolean(store)}
      onClose={onClose}
      title={`Review · ${store.name}`}
      className="max-w-4xl"
      footer={
        <>
          <Button
            variant="danger"
            loading={busyAction === 'reject'}
            disabled={busyAction !== null}
            onClick={() => onReject(store.id, reason)}
          >
            <X aria-hidden className="size-4" />
            Reject
          </Button>
          <Button
            variant="primary"
            loading={busyAction === 'approve'}
            disabled={busyAction !== null || (store.complianceReview?.errors.length ?? 0) > 0}
            onClick={() => onApprove(store.id)}
          >
            <CheckCircle2 aria-hidden className="size-4" />
            Approve &amp; go live
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone="brand">/{store.slug}</Badge>
          {store.planKey && <Badge tone="neutral">Plan: {store.planKey}</Badge>}
          {store.status && <Badge tone="brand">{store.status}</Badge>}
        </div>

        <Detail label="Owner">
          {store.owner ? `${store.owner.displayName} · ${store.owner.email}` : '—'}
        </Detail>
        <Detail label="Business address">{address || '—'}</Detail>
        <Detail label="Phone">{store.phone || '—'}</Detail>

        <Detail label="Subscription">
          {store.planKey ? (
            <>
              {store.planKey}
              {store.subscriptionStatus ? ` · ${store.subscriptionStatus}` : ''}
              {store.paymentMethodType ? ` · ${store.paymentMethodType}` : ''}
              {store.paymentLast4 ? ` •••• ${store.paymentLast4}` : ''}
            </>
          ) : (
            '—'
          )}
        </Detail>

        {store.tagline && <Detail label="Tagline">{store.tagline}</Detail>}

        <ComplianceReview store={store} />

        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-fg-muted">Branding</p>
          <div className="mt-2 flex flex-wrap gap-3">
            {store.logoUrl && (
              <img src={store.logoUrl} alt="" className="size-10 rounded-btn border border-border object-cover" />
            )}
            {COLOR_KEYS.map(({ key, label }) => {
              const value = store[key] as string | null | undefined
              if (!value) return null
              return (
                <span key={label} className="flex items-center gap-1.5 text-xs text-fg-muted">
                  <span className="size-5 rounded-full border border-border" style={{ backgroundColor: value }} />
                  {label}
                </span>
              )
            })}
          </div>
        </div>

        <Textarea
          label="Rejection reason (optional)"
          hint="Included in the email if you reject."
          rows={2}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />

        {error && (
          <p role="alert" className="rounded-btn bg-danger-50 px-3 py-2 text-sm font-medium text-danger-700">
            {error}
          </p>
        )}
      </div>
    </Modal>
  )
}

function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs font-bold uppercase tracking-wide text-fg-muted">{label}</p>
      <p className="mt-0.5 break-words text-sm text-fg">{children}</p>
    </div>
  )
}

function ComplianceReview({ store }: { store: Store }) {
  const c = store.compliance
  const docs = store.complianceDocuments ?? []
  const errors = store.complianceReview?.errors ?? []
  const cdtfa = store.complianceReview?.cdtfaVerifyUrl

  return (
    <div className="space-y-3 rounded-card border border-border bg-bg p-4">
      <p className="text-xs font-bold uppercase tracking-wide text-fg-muted">Licenses & entity</p>
      {errors.length > 0 && (
        <ul className="list-disc space-y-1 pl-5 text-sm text-danger-700">
          {errors.map((err) => (
            <li key={err}>{err}</li>
          ))}
        </ul>
      )}
      <Detail label="Legal name">{c?.legalBusinessName || '—'}</Detail>
      <Detail label="Entity">{c?.entityType || '—'}</Detail>
      <Detail label="EIN">{c?.ein || '—'}</Detail>
      <Detail label="Seller’s permit">{c?.sellerPermitNumber || (c?.noStateSalesTax ? 'No statewide sales tax' : '—')}</Detail>
      <Detail label="City license">{c?.cityLicenseNumber || '—'}</Detail>
      <Detail label="Buy / trade">
        {c?.usesBuyTrade ? `${c.secondhandStatus}${c.secondhandLicenseNumber ? ` · ${c.secondhandLicenseNumber}` : ''}` : 'Not used'}
      </Detail>
      <Detail label="Insurance attested">{c?.insuranceAttested ? 'Yes' : 'No'}</Detail>
      {cdtfa && (
        <p className="text-sm">
          <a href={cdtfa} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-semibold text-brand-600 hover:underline">
            Verify CA seller’s permit on CDTFA
            <ExternalLink aria-hidden className="size-3.5" />
          </a>
          <span className="text-fg-muted"> — lookup only; we do not scrape or auto-validate.</span>
        </p>
      )}
      <ComplianceDocumentGallery documents={docs} />
    </div>
  )
}

export default StoreApplicationModal
