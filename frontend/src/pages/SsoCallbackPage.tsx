import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { Loader2 } from 'lucide-react'
import { useAuth } from '../context/AuthContext'

/**
 * Landing page for the SSO redirect. The backend mints a JWT and bounces the
 * browser here with `#token=…` (a fragment, so the token never appears in
 * server logs or Referer headers); we adopt it and drop the user into the app.
 */
export default function SsoCallbackPage() {
  const { loginWithToken } = useAuth()
  const navigate = useNavigate()
  const [error, setError] = useState(false)
  const handled = useRef(false)

  useEffect(() => {
    if (handled.current) return
    handled.current = true

    const token = new URLSearchParams(window.location.hash.slice(1)).get('token')
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
