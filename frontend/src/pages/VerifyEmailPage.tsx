import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { Loader2, MailCheck } from 'lucide-react'
import api, { extractErrorMessage } from '../api/client'
import { useAuth } from '../context/AuthContext'
import AuthMarketingAside from '../components/AuthMarketingAside'
import { BrandLogo } from '../components/BrandLogo'

export default function VerifyEmailPage() {
  const { loginWithToken } = useAuth()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token') ?? ''
  const [error, setError] = useState('')
  const handled = useRef(false)

  useEffect(() => {
    if (handled.current) return
    if (token.length !== 64) {
      setError('This verification link is invalid or has expired.')
      return
    }
    handled.current = true

    api
      .post<{ token: string }>('/auth/verify-email', { token })
      .then(async ({ data }) => {
        await loginWithToken(data.token)
        const next = sessionStorage.getItem('verify-next') || '/'
        sessionStorage.removeItem('verify-next')
        navigate(next, { replace: true })
      })
      .catch((err) => {
        setError(extractErrorMessage(err, 'This verification link is invalid or has expired.'))
      })
  }, [loginWithToken, navigate, token])

  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <AuthMarketingAside
        eyebrow="Confirm your email"
        description="Hang tight while we confirm your address and sign you in."
      />

      <section className="flex items-center justify-center px-6 py-16 sm:px-10">
        <div className="w-full max-w-sm">
          <div className="mb-8 lg:hidden">
            <BrandLogo size="md" withWordmark />
          </div>

          <span className="grid size-12 place-items-center rounded-card bg-brand-50 text-brand-600">
            {error ? <MailCheck aria-hidden className="size-6" /> : <Loader2 aria-hidden className="size-6 animate-spin" />}
          </span>
          <h1 className="mt-5 font-display text-3xl font-bold tracking-tight text-fg">
            {error ? 'Could not verify' : 'Verifying email'}
          </h1>
          {error ? (
            <>
              <p role="alert" className="mt-4 rounded-btn bg-danger-50 px-3 py-2 text-sm font-medium text-danger-700">
                {error}
              </p>
              <p className="mt-6 text-sm text-fg-muted">
                <Link to="/verify-email/sent" className="font-bold text-brand-600 hover:underline">
                  Request a new link
                </Link>
                {' or '}
                <Link to="/login" className="font-bold text-brand-600 hover:underline">
                  sign in
                </Link>
                .
              </p>
            </>
          ) : (
            <p className="mt-2 text-sm text-fg-muted">This only takes a moment.</p>
          )}
        </div>
      </section>
    </div>
  )
}
