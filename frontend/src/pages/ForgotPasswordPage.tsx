import { useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { KeyRound } from 'lucide-react'
import api, { extractErrorMessage } from '../api/client'
import { Button, Input } from '../components/ui'
import AuthMarketingAside from '../components/AuthMarketingAside'
import { BrandLogo } from '../components/BrandLogo'
import { useStore } from '../hooks'

export default function ForgotPasswordPage() {
  const [searchParams] = useSearchParams()
  const storeSlug = searchParams.get('store') ?? ''
  const { data: store } = useStore(storeSlug)
  const [email, setEmail] = useState('')
  const [error, setError] = useState('')
  const [sent, setSent] = useState(false)
  const [loading, setLoading] = useState(false)

  const loginTo = storeSlug ? `/login?store=${encodeURIComponent(storeSlug)}` : '/login'

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    setError('')
    setLoading(true)
    try {
      await api.post('/auth/forgot-password', { email: email.trim() })
      setSent(true)
    } catch (err) {
      setError(extractErrorMessage(err, 'Could not send a reset email. Please try again.'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <AuthMarketingAside
        eyebrow="Account recovery"
        storeName={store?.name}
        description="We’ll email a one-time link so you can choose a new password. The link expires in one hour."
      />

      <section className="flex items-center justify-center px-6 py-16 sm:px-10">
        <div className="w-full max-w-sm">
          <div className="mb-8 lg:hidden">
            <BrandLogo size="md" withWordmark />
          </div>

          <span className="grid size-12 place-items-center rounded-card bg-brand-50 text-brand-600">
            <KeyRound aria-hidden className="size-6" />
          </span>
          <h1 className="mt-5 font-display text-3xl font-bold tracking-tight text-fg">Forgot password</h1>
          <p className="mt-2 text-sm text-fg-muted">
            Remembered it?{' '}
            <Link to={loginTo} className="font-bold text-brand-600 hover:underline">
              Sign in
            </Link>
          </p>

          {sent ? (
            <p role="status" className="mt-8 rounded-btn bg-brand-50 px-3 py-2 text-sm font-medium text-fg">
              If that email is registered, we sent a reset link. Check your inbox and spam folder.
            </p>
          ) : (
            <form onSubmit={handleSubmit} className="mt-8 space-y-4">
              <Input
                label="Email"
                type="email"
                autoComplete="email"
                autoFocus
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                aria-invalid={error ? true : undefined}
                required
              />
              {error && (
                <p role="alert" aria-live="polite" className="rounded-btn bg-danger-50 px-3 py-2 text-sm font-medium text-danger-700">
                  {error}
                </p>
              )}
              <Button type="submit" size="lg" loading={loading} className="w-full">
                <KeyRound aria-hidden className="size-4" />
                {loading ? 'Sending…' : 'Send reset link'}
              </Button>
            </form>
          )}
        </div>
      </section>
    </div>
  )
}
