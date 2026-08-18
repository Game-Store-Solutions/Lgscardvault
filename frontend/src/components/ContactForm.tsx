import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { CheckCircle2, Send } from 'lucide-react'
import api, { extractErrorMessage } from '../api/client'
import { Button, Input, Textarea } from './ui'

/**
 * Landing-page contact form. Posts to the backend so the team's inboxes stay
 * out of the frontend bundle (a mailto: link hands them to every scraper).
 */
export function ContactForm() {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [message, setMessage] = useState('')

  const send = useMutation({
    mutationFn: async () => {
      await api.post('/contact', { name: name.trim(), email: email.trim(), message: message.trim() })
    },
  })

  const ready = name.trim() !== '' && email.trim() !== '' && message.trim() !== ''

  if (send.isSuccess) {
    return (
      <div
        role="status"
        className="flex items-start gap-3 rounded-card border border-success-500/30 bg-success-50 p-5 text-sm leading-relaxed text-success-700"
      >
        <CheckCircle2 aria-hidden className="mt-0.5 size-5 shrink-0" />
        <p>
          Thanks — your message is on its way. We’ll reply to{' '}
          <span className="font-bold">{email.trim()}</span>.
        </p>
      </div>
    )
  }

  return (
    <form
      className="space-y-3"
      onSubmit={(event) => {
        event.preventDefault()
        if (ready) send.mutate()
      }}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Input
          label="Your name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          maxLength={120}
          autoComplete="name"
          required
        />
        <Input
          label="Email"
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          maxLength={180}
          autoComplete="email"
          required
        />
      </div>
      <Textarea
        label="How can we help?"
        rows={4}
        value={message}
        onChange={(event) => setMessage(event.target.value)}
        maxLength={4000}
        placeholder="Tell us about your store, or what you're looking for."
        required
      />

      {send.isError && (
        <p role="alert" className="text-sm font-medium text-danger-700">
          {extractErrorMessage(send.error, 'Could not send your message. Please try again.')}
        </p>
      )}

      <Button type="submit" size="lg" className="w-full sm:w-auto" loading={send.isPending} disabled={!ready}>
        <Send aria-hidden className="size-4" />
        Send message
      </Button>
    </form>
  )
}

export default ContactForm
