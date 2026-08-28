import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { CheckCircle2, Mail } from 'lucide-react'
import api, { extractErrorMessage } from '../api/client'
import { Button, Input } from './ui'

export function NewsletterSignup({ className }: { className?: string }) {
  const [email, setEmail] = useState('')

  const subscribe = useMutation({
    mutationFn: async () => {
      await api.post('/newsletter', { email: email.trim(), source: 'landing' })
    },
  })

  const ready = email.trim() !== ''

  if (subscribe.isSuccess) {
    return (
      <div
        role="status"
        className="flex items-start gap-3 rounded-card border border-success-500/30 bg-success-50 p-5 text-sm leading-relaxed text-success-700"
      >
        <CheckCircle2 aria-hidden className="mt-0.5 size-5 shrink-0" />
        <p>
          You&apos;re on the list. We&apos;ll send updates to{' '}
          <span className="font-bold">{email.trim()}</span>.
        </p>
      </div>
    )
  }

  return (
    <form
      className={className}
      onSubmit={(event) => {
        event.preventDefault()
        if (ready) subscribe.mutate()
      }}
    >
      <p className="text-eyebrow">Newsletter</p>
      <h2 className="mt-2.5 text-display-sm sm:text-display-md">New stores and deck-builder drops</h2>
      <p className="mt-3 max-w-xl text-[0.95rem] font-medium leading-7 text-fg/75 dark:text-fg-muted">
        Get occasional email when verified stores join the marketplace or we ship big Commander tools.
      </p>
      <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-end">
        <Input
          label="Email"
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          maxLength={180}
          autoComplete="email"
          required
          className="sm:min-w-[16rem] sm:flex-1"
        />
        <Button type="submit" size="lg" loading={subscribe.isPending} disabled={!ready} className="sm:mb-0.5">
          <Mail aria-hidden className="size-4" />
          Subscribe
        </Button>
      </div>
      {subscribe.isError && (
        <p role="alert" className="mt-3 text-sm font-medium text-danger-700">
          {extractErrorMessage(subscribe.error, 'Could not subscribe. Please try again.')}
        </p>
      )}
    </form>
  )
}

export default NewsletterSignup
