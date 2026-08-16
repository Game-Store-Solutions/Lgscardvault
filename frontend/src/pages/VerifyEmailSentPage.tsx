import { useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { MailCheck } from 'lucide-react'
import api, { extractErrorMessage } from '../api/client'
import { Button, Input } from '../components/ui'
import AuthMarketingAside from '../components/AuthMarketingAside'
import { BrandLogo } from '../components/BrandLogo'

export default function VerifyEmailSentPage() {
  const [searchParams] = useSearchParams()
  const presetEmail = searchParams.get('email') ?? ''
  const [email, setEmail] = useState(presetEmail)
  const [error, setError] = useState('')
  const [sent, setSent] = useState(Boolean(presetEmail))
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    setError('')
    setLoading(true)
    try {
      await api.post('/auth/resend-verification', { email: email.trim() })
      setSent(true)
    } catch (err) {
      setError(extractErrorMessage(err, 'Could not send a verification email. Please try again.'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <AuthMarketingAside
        eyebrow="Confirm your email"
        description="We sent a link to finish creating your account. It expires in 24 hours and can only be used once."
      />

      <section className="flex items-center justify-center px-6 py-16 sm:px-10">
        <div className="w-full max-w-sm">
          <div className="mb-8 lg:hidden">
            <BrandLogo size="md" withWordmark />
          </div>

          <span className="grid size-12 place-items-center rounded-card bg-brand-50 text-brand-600">
            <MailCheck aria-hidden className="size-6" />
          </span>
          <h1 className="mt-5 font-display text-3xl font-bold tracking-tight text-fg">Check your inbox</h1>
          <p className="mt-2 text-sm text-fg-muted">
            Already confirmed?{' '}
            <Link to="/login" className="font-bold text-brand-600 hover:underline">
              Sign in
            </Link>
          </p>

          {sent && (
            <p role="status" className="mt-8 rounded-btn bg-brand-50 px-3 py-2 text-sm font-medium text-fg">
              If that email still needs verification, we sent a link. Check your inbox and spam folder.
            </p>
          )}

          <form onSubmit={handleSubmit} className="mt-8 space-y-4">
            <Input
              label="Email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
            {error && (
              <p role="alert" aria-live="polite" className="rounded-btn bg-danger-50 px-3 py-2 text-sm font-medium text-danger-700">
                {error}
              </p>
            )}
            <Button type="submit" size="lg" loading={loading} className="w-full">
              {loading ? 'Sending…' : sent ? 'Resend link' : 'Send verification link'}
            </Button>
          </form>
        </div>
      </section>
    </div>
  )
}
