import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { Loader2 } from 'lucide-react'
import api from '../api/client'
import { Button, Input } from '../components/ui'
import { useAuth } from '../context/AuthContext'

/**
 * Landing page for the SSO redirect. The backend mints a JWT and bounces the
 * browser here with `#token=…` (a fragment, so the token never appears in
 * server logs or Referer headers); we adopt it and drop the user into the app.
 *
 * New Google accounts (and existing accounts with no date of birth) land with
 * `#complete=1&ticket=…` and must attest 13+ before a JWT is issued.
 */
export default function SsoCallbackPage() {
  const { loginWithToken } = useAuth()
  const navigate = useNavigate()
  const [error, setError] = useState(false)
  const [ticket, setTicket] = useState<string | null>(null)
  const [dateOfBirth, setDateOfBirth] = useState('')
  const [acceptedTerms, setAcceptedTerms] = useState(false)
  const [formError, setFormError] = useState('')
  const [loading, setLoading] = useState(false)
  const handled = useRef(false)

  useEffect(() => {
    if (handled.current) return
    handled.current = true

    const params = new URLSearchParams(window.location.hash.slice(1))
    const completeTicket = params.get('ticket')
    if (params.get('complete') === '1' && completeTicket) {
      setTicket(completeTicket)
      window.history.replaceState(null, '', window.location.pathname)
      return
    }

    const token = params.get('token')
    if (!token) {
      setError(true)
      return
    }
    loginWithToken(token)
      .then(() => {
        const next = sessionStorage.getItem('sso-next') || '/'
        sessionStorage.removeItem('sso-next')
        navigate(next, { replace: true })
      })
      .catch(() => setError(true))
  }, [loginWithToken, navigate])

  async function submitAge(event: React.FormEvent) {
    event.preventDefault()
    if (!ticket) return
    setFormError('')
    setLoading(true)
    try {
      const { data } = await api.post<{ token: string }>('/auth/sso/complete', {
        ticket,
        dateOfBirth,
        acceptedTerms,
      })
      await loginWithToken(data.token)
      const next = sessionStorage.getItem('sso-next') || '/'
      sessionStorage.removeItem('sso-next')
      navigate(next, { replace: true })
    } catch (e) {
      const message =
        (e as { response?: { data?: { error?: string } } })?.response?.data?.error ??
        'Could not finish sign-in. Please try again.'
      setFormError(message)
    } finally {
      setLoading(false)
    }
  }

  if (ticket) {
    return (
      <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6 py-12">
        <h1 className="font-display text-2xl font-bold text-fg">Confirm you are 13 or older</h1>
        <p className="mt-2 text-sm text-fg-muted">
          Google sign-in needs a date of birth before we create a session. We do not verify government ID.
        </p>
        <form className="mt-6 space-y-4" onSubmit={submitAge}>
          <Input
            label="Date of birth"
            type="date"
            autoComplete="bday"
            value={dateOfBirth}
            onChange={(e) => setDateOfBirth(e.target.value)}
            required
          />
          <label className="flex items-start gap-2 text-sm leading-5 text-fg-muted">
            <input
              type="checkbox"
              className="mt-0.5 size-4 accent-current"
              checked={acceptedTerms}
              onChange={(e) => setAcceptedTerms(e.target.checked)}
              required
            />
            <span>
              I agree to the{' '}
              <Link to="/terms" className="font-semibold text-brand-600 hover:underline">
                Terms
              </Link>{' '}
              and{' '}
              <Link to="/privacy" className="font-semibold text-brand-600 hover:underline">
                Privacy Policy
              </Link>
              . I confirm I am at least 13.
            </span>
          </label>
          {formError !== '' && (
            <p role="alert" className="rounded-btn bg-danger-50 px-3 py-2 text-sm font-medium text-danger-700">
              {formError}
            </p>
          )}
          <Button type="submit" size="lg" className="w-full" loading={loading} disabled={!acceptedTerms || !dateOfBirth}>
            Continue
          </Button>
        </form>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 px-6 text-center">
        <h1 className="font-display text-2xl font-bold text-fg">Sign-in failed</h1>
        <p className="text-fg-muted">We couldn't complete single sign-on. Please try again.</p>
        <Link to="/login" className="font-bold text-brand-600 hover:underline">
          Back to sign in
        </Link>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-3 text-fg-muted">
      <Loader2 aria-hidden className="size-8 animate-spin text-brand-600" />
      <p>Signing you in…</p>
    </div>
  )
}
