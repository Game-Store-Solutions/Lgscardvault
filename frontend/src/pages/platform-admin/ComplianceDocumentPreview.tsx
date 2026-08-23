import { useEffect, useState } from 'react'
import { ExternalLink, FileText } from 'lucide-react'
import api, { extractErrorMessage } from '../../api/client'
import type { ComplianceDocumentMeta } from '../../api/types'
import { Badge, Button, Skeleton, Spinner } from '../../components/ui'

const KIND_LABELS: Record<string, string> = {
  seller_permit: 'Seller’s permit',
  city_license: 'City license',
  secondhand: 'Secondhand / buy-trade',
}

type Preview =
  | { status: 'loading' }
  | { status: 'ready'; url: string }
  | { status: 'error'; message: string }

function kindLabel(kind: string): string {
  return KIND_LABELS[kind] ?? kind.replaceAll('_', ' ')
}

function isImage(mime: string): boolean {
  return mime.startsWith('image/')
}

function isPdf(mime: string): boolean {
  return mime === 'application/pdf'
}

async function fetchPreview(id: number): Promise<string> {
  const { data } = await api.get<Blob>(`/compliance-documents/${id}`, { responseType: 'blob' })
  return URL.createObjectURL(data)
}

/**
 * Authenticated inline viewer for a private compliance upload (PDF or image).
 * Object URLs are revoked when the document unmounts or is reloaded.
 */
export function ComplianceDocumentPreview({ document }: { document: ComplianceDocumentMeta }) {
  const [preview, setPreview] = useState<Preview>({ status: 'loading' })
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    let cancelled = false
    let objectUrl: string | null = null
    setPreview({ status: 'loading' })

    void fetchPreview(document.id)
      .then((url) => {
        if (cancelled) {
          URL.revokeObjectURL(url)
          return
        }
        objectUrl = url
        setPreview({ status: 'ready', url })
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setPreview({ status: 'error', message: extractErrorMessage(error, 'Could not load this file.') })
        }
      })

    return () => {
      cancelled = true
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [document.id, reloadKey])

  return (
    <article className="overflow-hidden rounded-card border border-border bg-surface">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-3 py-2.5">
        <div className="min-w-0">
          <p className="text-xs font-bold uppercase tracking-wide text-fg-muted">{kindLabel(document.kind)}</p>
          <p className="mt-0.5 truncate text-sm font-medium text-fg" title={document.originalFilename}>
            {document.originalFilename}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge tone="neutral">{isPdf(document.mime) ? 'PDF' : isImage(document.mime) ? 'Image' : document.mime}</Badge>
          {preview.status === 'ready' && (
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={() => window.open(preview.url, '_blank', 'noopener,noreferrer')}
            >
              <ExternalLink aria-hidden className="size-3.5" />
              Open
            </Button>
          )}
        </div>
      </header>

      <div className="bg-bg">
        {preview.status === 'loading' && (
          <div className="grid h-72 place-items-center" aria-busy="true">
            <div className="flex flex-col items-center gap-2 text-sm text-fg-muted">
              <Spinner label={`Loading ${document.originalFilename}`} />
              <Skeleton className="h-3 w-32" />
            </div>
          </div>
        )}

        {preview.status === 'error' && (
          <div className="grid h-40 place-items-center px-4 text-center">
            <div>
              <p role="alert" className="text-sm font-medium text-danger-700">
                {preview.message}
              </p>
              <Button type="button" size="sm" variant="secondary" className="mt-3" onClick={() => setReloadKey((n) => n + 1)}>
                Try again
              </Button>
            </div>
          </div>
        )}

        {preview.status === 'ready' && isImage(document.mime) && (
          <img
            src={preview.url}
            alt={`${kindLabel(document.kind)}: ${document.originalFilename}`}
            className="mx-auto max-h-[28rem] w-full object-contain"
          />
        )}

        {preview.status === 'ready' && isPdf(document.mime) && (
          <iframe
            title={`${kindLabel(document.kind)}: ${document.originalFilename}`}
            src={preview.url}
            sandbox=""
            className="h-[28rem] w-full border-0 bg-white"
          />
        )}

        {preview.status === 'ready' && !isImage(document.mime) && !isPdf(document.mime) && (
          <div className="flex h-32 items-center justify-center gap-2 text-sm text-fg-muted">
            <FileText aria-hidden className="size-4" />
            Preview is not available for this file type. Use Open to view it.
          </div>
        )}
      </div>
    </article>
  )
}

export function ComplianceDocumentGallery({ documents }: { documents: ComplianceDocumentMeta[] }) {
  if (documents.length === 0) {
    return (
      <p className="rounded-btn border border-dashed border-border bg-surface px-3 py-3 text-sm text-fg-muted">
        No license files uploaded.
      </p>
    )
  }

  return (
    <div className="space-y-3">
      <p className="text-xs font-bold uppercase tracking-wide text-fg-muted">
        Uploaded files · {documents.length}
      </p>
      {documents.map((document) => (
        <ComplianceDocumentPreview key={document.id} document={document} />
      ))}
    </div>
  )
}

export default ComplianceDocumentPreview
