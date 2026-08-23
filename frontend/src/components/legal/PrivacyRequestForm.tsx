import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { CheckCircle2, Send } from 'lucide-react'
import api, { extractErrorMessage } from '../../api/client'
import { Button, Input, Select, Textarea } from '../ui'

const PRIVACY_TYPES = [
  { value: 'do_not_sell', label: 'Do not sell or share my personal information' },
  { value: 'access', label: 'Access the personal information you hold about me' },
  { value: 'delete', label: 'Delete my personal information' },
  { value: 'correct', label: 'Correct inaccurate personal information' },
] as const

const TAKEDOWN_TYPES = [
  { value: 'takedown', label: 'Publisher / rights-holder takedown request' },
] as const

type RequestTypeOption = { value: string; label: string }

/**
 * CCPA / privacy-rights intake, or a publisher takedown when `variant` is
 * `takedown`. Stores a ticket for platform admins instead of a mailto-only policy.
 */
export function PrivacyRequestForm({
  variant = 'privacy',
}: {
  variant?: 'privacy' | 'takedown'
}) {
  const types: RequestTypeOption[] = variant === 'takedown' ? [...TAKEDOWN_TYPES] : [...PRIVACY_TYPES]
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [type, setType] = useState(types[0]?.value ?? 'do_not_sell')
  const [californiaResident, setCaliforniaResident] = useState(variant === 'privacy')
  const [details, setDetails] = useState('')

  const send = useMutation({
    mutationFn: async () => {
      const { data } = await api.post<{ status: string; reference: number; detail: string }>('/privacy/requests', {
        name: name.trim(),
        email: email.trim(),
        type,
        californiaResident: variant === 'takedown' ? false : californiaResident,
        details: details.trim(),
      })
      return data
    },
  })

  const ready = name.trim() !== '' && email.trim() !== '' && types.some((t) => t.value === type)

  if (send.isSuccess) {
    return (
      <div
        role="status"
        className="flex items-start gap-3 rounded-card border border-success-500/30 bg-success-50 p-5 text-sm leading-relaxed text-success-700"
      >
        <CheckCircle2 aria-hidden className="mt-0.5 size-5 shrink-0" />
        <p>
          Request received (reference #{send.data.reference}). We will email{' '}
          <span className="font-bold">{email.trim()}</span>
          {variant === 'takedown' ? '.' : ' within 45 days.'}
        </p>
      </div>
    )
  }

  return (
    <form
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault()
        if (ready) send.mutate()
      }}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Input
          label="Your name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={120}
          autoComplete="name"
          required
        />
        <Input
          label="Email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          maxLength={180}
          autoComplete="email"
          required
        />
      </div>
      {types.length > 1 ? (
        <Select label="Request type" value={type} onChange={(e) => setType(e.target.value)} required>
          {types.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </Select>
      ) : null}
      {variant === 'privacy' ? (
        <label className="flex items-start gap-2 text-sm leading-5 text-fg">
          <input
            type="checkbox"
            className="mt-0.5 size-4 accent-current"
            checked={californiaResident}
            onChange={(e) => setCaliforniaResident(e.target.checked)}
          />
          I am a California resident (or making this request under a similar state privacy law).
        </label>
      ) : (
        <p className="text-sm text-fg-muted">
          Describe the work, URL, and the right you claim. We queue this for platform admins and email the
          legal contact.
        </p>
      )}
      <Textarea
        label={variant === 'takedown' ? 'What should come down, and why' : 'Details (optional)'}
        rows={4}
        value={details}
        onChange={(e) => setDetails(e.target.value)}
        maxLength={4000}
        hint={
          variant === 'takedown'
            ? 'Page URL, card or image, publisher, and a way to reach you.'
            : 'Account email, order number, or anything that helps us find your records.'
        }
        required={variant === 'takedown'}
      />
      {send.isError && (
        <p role="alert" className="text-sm font-medium text-danger-700">
          {extractErrorMessage(send.error, 'Could not submit your request. Please try again.')}
        </p>
      )}
      <Button type="submit" disabled={!ready || (variant === 'takedown' && details.trim() === '')} loading={send.isPending}>
        <Send aria-hidden className="size-4" />
        Submit request
      </Button>
    </form>
  )
}
