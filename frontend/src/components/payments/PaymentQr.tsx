import { useEffect, useState } from 'react'
import { ExternalLink } from 'lucide-react'
import QRCode from 'qrcode'

export function PaymentQr({
  url,
  caption = 'Scan to pay with Square',
}: {
  url: string
  caption?: string
}) {
  const [src, setSrc] = useState('')

  useEffect(() => {
    let cancelled = false
    void QRCode.toDataURL(url, {
      margin: 1,
      width: 220,
      color: { dark: '#111111', light: '#ffffff' },
    }).then((dataUrl) => {
      if (!cancelled) setSrc(dataUrl)
    })
    return () => {
      cancelled = true
    }
  }, [url])

  return (
    <div className="flex flex-col items-center gap-3 rounded-xl border border-border bg-bg px-4 py-4">
      {src ? (
        <img src={src} alt={caption} width={196} height={196} className="rounded-lg bg-white p-2" />
      ) : (
        <div className="size-[196px] animate-pulse rounded-lg bg-border/60" />
      )}
      <p className="text-center text-xs leading-5 text-fg-muted">{caption}</p>
      <a
        href={url}
        target="_blank"
        rel="noreferrer"
        className="inline-flex items-center gap-1.5 text-sm font-bold text-brand-600 hover:underline"
      >
        Open Square checkout
        <ExternalLink aria-hidden className="size-3.5" />
      </a>
    </div>
  )
}
