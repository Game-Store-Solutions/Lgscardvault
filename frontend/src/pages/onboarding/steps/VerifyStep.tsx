import { useState } from 'react'
import { MailCheck } from 'lucide-react'
import api, { extractErrorMessage } from '../../../api/client'
import { Button, Input } from '../../../components/ui'
import type { OnboardingData, Patch } from '../types'

export function VerifyStep({
  data,
  patch,
  verified,
}: {
  data: OnboardingData
  patch: Patch
  verified: boolean
}) {
  const [resendBusy, setResendBusy] = useState(false)
  const [resendNote, setResendNote] = useState('')
  const [resendError, setResendError] = useState('')

  if (verified) {
    return (
      <p className="flex items-center gap-2 rounded-btn bg-success-50 px-3 py-2 text-sm font-medium text-success-700">
        <MailCheck aria-hidden className="size-4" />
        {data.email} is verified. Continue to set up your store.
      </p>
    )
  }

  async function resend() {
    setResendError('')
    setResendNote('')
    setResendBusy(true)
    try {
      await api.post('/auth/resend-verification', { email: data.email.trim() })
      setResendNote('If that inbox still needs a code, we sent a new one.')
    } catch (error) {
      setResendError(extractErrorMessage(error, 'Could not resend the code. Wait a moment and try again.'))
    } finally {
      setResendBusy(false)
    }
  }

  return (
    <div className="max-w-md space-y-4">
      <p className="text-sm leading-6 text-fg-muted">
        We emailed a 6-digit code to <span className="font-semibold text-fg">{data.email}</span>. Enter it here to
        keep setting up your store — you will not be sent to another page.
      </p>
      <Input
        label="Verification code"
        inputMode="numeric"
        autoComplete="one-time-code"
        maxLength={6}
        value={data.verifyCode}
        onChange={(e) => patch({ verifyCode: e.target.value.replace(/\D/g, '').slice(0, 6) })}
        hint="Check inbox and spam. The code expires in 24 hours."
        className="tracking-[0.35em]"
        required
      />
      {resendNote ? (
        <p role="status" className="text-sm font-medium text-fg">
          {resendNote}
        </p>
      ) : null}
      {resendError ? (
        <p role="alert" className="text-sm font-medium text-danger-700">
          {resendError}
        </p>
      ) : null}
      <Button type="button" variant="secondary" size="sm" loading={resendBusy} onClick={() => void resend()}>
        Resend code
      </Button>
    </div>
  )
}

export default VerifyStep
