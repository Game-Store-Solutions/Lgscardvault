import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { KeyRound } from 'lucide-react'
import api, { extractErrorMessage } from '../api/client'
import { Button, Input } from '../components/ui'
import AuthMarketingAside from '../components/AuthMarketingAside'
import { BrandLogo } from '../components/BrandLogo'

export default function ResetPasswordPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token') ?? ''
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    setError('')
    if (password !== confirm) {
      setError('Passwords do not match.')
      return
    }
    setLoading(true)
    try {
      await api.post('/auth/reset-password', { token, password })
      navigate('/login?reset=1', { replace: true })
    } catch (err) {
      setError(extractErrorMessage(err, 'This reset link is invalid or has expired.'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <AuthMarketingAside
        eyebrow="Account recovery"
        description="Choose a new password for your LGS Card Vault account. You’ll sign in with it on the next screen."
      />

      <section className="flex items-center justify-center px-6 py-16 sm:px-10">
        <div className="w-full max-w-sm">
          <div className="mb-8 lg:hidden">
            <BrandLogo size="md" withWordmark />
          </div>

          <span className="grid size-12 place-items-center rounded-card bg-brand-50 text-brand-600">
            <KeyRound aria-hidden className="size-6" />
          </span>
          <h1 className="mt-5 font-display text-3xl font-bold tracking-tight text-fg">Set a new password</h1>
          <p className="mt-2 text-sm text-fg-muted">
            Back to{' '}
            <Link to="/login" className="font-bold text-brand-600 hover:underline">
              sign in
            </Link>
          </p>

          {token.length !== 64 ? (
            <p role="alert" className="mt-8 rounded-btn bg-danger-50 px-3 py-2 text-sm font-medium text-danger-700">
              This reset link is invalid or has expired.{' '}
              <Link to="/forgot-password" className="font-bold underline">
                Request a new one
              </Link>
              .
            </p>
          ) : (
            <form onSubmit={handleSubmit} className="mt-8 space-y-4">
              <Input
                label="New password"
                type="password"
                autoComplete="new-password"
                autoFocus
                hint="At least 8 characters."
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                minLength={8}
                aria-invalid={error ? true : undefined}
                required
              />
              <Input
                label="Confirm password"
                type="password"
                autoComplete="new-password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                minLength={8}
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
                {loading ? 'Saving…' : 'Update password'}
              </Button>
            </form>
          )}
        </div>
      </section>
    </div>
  )
}
