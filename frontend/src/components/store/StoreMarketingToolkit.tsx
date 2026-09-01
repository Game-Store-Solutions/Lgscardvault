import { useEffect, useState } from 'react'
import { Check, Copy, QrCode } from 'lucide-react'
import QRCode from 'qrcode'
import { Button } from '../ui'
import { absoluteUrl, copyText } from '../../lib/share'

export function StoreMarketingToolkit({ slug, storeName }: { slug: string; storeName: string }) {
  const storefrontUrl = absoluteUrl(`/s/${slug}`)
  const [qrSrc, setQrSrc] = useState('')
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    let cancelled = false
    void QRCode.toDataURL(storefrontUrl, {
      margin: 1,
      width: 200,
      color: { dark: '#111111', light: '#ffffff' },
    }).then((dataUrl) => {
      if (!cancelled) setQrSrc(dataUrl)
    })
    return () => {
      cancelled = true
    }
  }, [storefrontUrl])

  async function copyStoreUrl() {
    if (await copyText(storefrontUrl)) {
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    }
  }

  return (
    <div className="rounded-card border border-border bg-surface p-5 shadow-sm">
      <div className="flex items-start gap-2">
        <span className="grid size-10 shrink-0 place-items-center rounded-btn bg-brand-50 text-brand-600">
          <QrCode aria-hidden className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="font-display text-base font-bold text-fg">Marketing toolkit</h3>
          <p className="mt-1 text-sm text-fg-muted">
            Share your storefront link on social, event flyers, and the counter. Players scan the QR to
            shop {storeName} online.
          </p>
        </div>
      </div>

      <div className="mt-5 flex flex-col gap-5 sm:flex-row sm:items-start">
        {qrSrc ? (
          <img
            src={qrSrc}
            alt={`QR code for ${storeName} storefront`}
            width={200}
            height={200}
            className="mx-auto rounded-lg border border-border bg-white p-2 sm:mx-0"
          />
        ) : (
          <div className="mx-auto size-[200px] animate-pulse rounded-lg bg-border/50 sm:mx-0" />
        )}
        <div className="min-w-0 flex-1 space-y-3">
          <p className="break-all rounded-lg bg-bg px-3 py-2 font-mono text-xs text-fg">{storefrontUrl}</p>
          <div className="flex flex-wrap gap-2">
            <Button type="button" size="sm" variant="secondary" onClick={() => void copyStoreUrl()}>
              {copied ? <Check aria-hidden className="size-4" /> : <Copy aria-hidden className="size-4" />}
              {copied ? 'Copied' : 'Copy link'}
            </Button>
          </div>
          <p className="text-xs leading-relaxed text-fg-muted">
            Tip: add this link to your Google Business profile, Linktree, Discord, and event posters.
          </p>
        </div>
      </div>
    </div>
  )
}
