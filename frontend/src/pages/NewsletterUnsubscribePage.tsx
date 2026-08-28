import { useEffect, useRef } from 'react'
import { useSearchParams } from 'react-router'
import { useMutation } from '@tanstack/react-query'
import { CheckCircle2, MailX } from 'lucide-react'
import api, { extractErrorMessage } from '../api/client'
import { BackButton } from '../components/ui'

export default function NewsletterUnsubscribePage() {
  const [params] = useSearchParams()
  const token = params.get('token') ?? ''

  const unsubscribe = useMutation({
    mutationFn: async (unsubscribeToken: string) => {
      await api.post('/newsletter/unsubscribe', { token: unsubscribeToken })
    },
  })

  const fired = useRef(false)
  useEffect(() => {
    if (!token || fired.current) return
    fired.current = true
    unsubscribe.mutate(token)
  }, [token, unsubscribe])

  return (
    <div className="mx-auto flex min-h-[60vh] max-w-lg flex-col justify-center px-6 py-16">
      <BackButton to="/">Home</BackButton>

      {!token && (
        <div className="mt-8 rounded-card border border-border bg-surface p-6 text-sm text-fg-muted">
          This unsubscribe link is missing a token. Use the link from your email.
        </div>
      )}

      {token && unsubscribe.isPending && (
        <div className="mt-8 rounded-card border border-border bg-surface p-6 text-sm text-fg-muted">
          Processing your unsubscribe request…
        </div>
      )}

      {token && unsubscribe.isSuccess && (
        <div
          role="status"
          className="mt-8 flex items-start gap-3 rounded-card border border-success-500/30 bg-success-50 p-6 text-sm leading-relaxed text-success-700"
        >
          <CheckCircle2 aria-hidden className="mt-0.5 size-5 shrink-0" />
          <div>
            <p className="font-bold">You&apos;re unsubscribed.</p>
            <p className="mt-1">You won&apos;t receive further newsletter emails from LGS Card Vault.</p>
          </div>
        </div>
      )}

      {token && unsubscribe.isError && (
        <div
          role="alert"
          className="mt-8 flex items-start gap-3 rounded-card border border-danger-500/30 bg-danger-50 p-6 text-sm leading-relaxed text-danger-700"
        >
          <MailX aria-hidden className="mt-0.5 size-5 shrink-0" />
          <p>{extractErrorMessage(unsubscribe.error, 'This unsubscribe link is invalid or has already been used.')}</p>
        </div>
      )}
    </div>
  )
}
