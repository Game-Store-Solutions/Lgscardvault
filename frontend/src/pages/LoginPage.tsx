import { useState } from 'react'
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router'
import { LogIn } from 'lucide-react'
import { useStore } from '../hooks'
import { Button, Input } from '../components/ui'
import AuthMarketingAside from '../components/AuthMarketingAside'
import { BrandLogo } from '../components/BrandLogo'
import { SsoOption, useSsoStatus } from '../components/SsoOption'
import { useAuth } from '../context/AuthContext'
import type { UserProfile } from '../api/types'

/**
 * Where to send a user right after login. Honors the pre-login `from` path only
 * when the freshly authenticated user is actually allowed there; otherwise it
 * routes to a role-appropriate landing. This stops a logout → login as another
 * account from dropping the new user onto the previous user's store admin.
 */
function safeDestination(from: string, user: UserProfile | null): string {
  const roleHome = defaultHome(user)
  if (!user) return from

  const isSuperAdmin = user.roles.includes('ROLE_SUPER_ADMIN')

  // Platform admin routes: super-admins only.
  if (from.startsWith('/platform')) {
    return isSuperAdmin ? from : roleHome
  }

  // Store admin routes (/s/{slug}/admin…): the user must own that store
  // (super-admins may go anywhere).
  const adminMatch = from.match(/^\/s\/([^/]+)\/admin/)
  if (adminMatch) {
    const slug = adminMatch[1]
    const ownsStore = user.ownedStores.some((store) => store.slug === slug)
    return isSuperAdmin || ownsStore ? from : roleHome
  }

  // Public / customer routes are fine for anyone.
  return from
}

/** Role-appropriate landing when `from` isn't reachable for this user. */
function defaultHome(user: UserProfile | null): string {
  if (!user) return '/'
  if (user.roles.includes('ROLE_SUPER_ADMIN')) return '/platform/admin'
  if (user.ownedStores.length > 0) return `/s/${user.ownedStores[0].slug}/admin`
  return '/'
}

export default function LoginPage() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [searchParams] = useSearchParams()
  const storeSlug = searchParams.get('store') ?? ''
  const { data: store } = useStore(storeSlug)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const ssoParam = searchParams.get('sso')
  const sso = useSsoStatus()

  const from = (location.state as { from?: string } | null)?.from ?? (storeSlug ? `/s/${storeSlug}` : '/')

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    setError('')
    setLoading(true)
    try {
      const loggedInUser = await login(email, password)
      // Only honor the pre-login destination if this user can actually reach it;
      // otherwise a logout→login as a different account would land on the
      // previous user's store admin. Fall back to a role-appropriate home.
      navigate(safeDestination(from, loggedInUser))
    } catch {
      setError('Invalid email or password.')
    } finally {
      setLoading(false)
    }
  }

  const hasError = Boolean(error)

  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <AuthMarketingAside
        eyebrow="Welcome back"
        storeName={store?.name}
        description="Sign in to save favorites, keep a want list, and move across every storefront with one account."
      />

      <section className="flex items-center justify-center px-6 py-16 sm:px-10">
        <div className="w-full max-w-sm">
          {/* Mobile brand mark (the image panel is hidden on small screens) */}
          <div className="mb-8 lg:hidden">
            <BrandLogo size="md" withWordmark />
          </div>

          <span className="grid size-12 place-items-center rounded-card bg-brand-50 text-brand-600">
            <LogIn aria-hidden className="size-6" />
          </span>
          <h1 className="mt-5 font-display text-3xl font-bold tracking-tight text-fg">Sign in</h1>
          <p className="mt-2 text-sm text-fg-muted">
            New here?{' '}
            <Link to="/register/customer" className="font-bold text-brand-600 hover:underline">
              Create an account
            </Link>
          </p>

          {ssoParam === 'failed' && (
            <p role="alert" className="mt-6 rounded-btn bg-danger-50 px-3 py-2 text-sm font-medium text-danger-700">
              Single sign-on failed. Please try again or use your email and password.
            </p>
          )}
          {ssoParam === 'unconfigured' && (
            <p role="alert" className="mt-6 rounded-btn bg-danger-50 px-3 py-2 text-sm font-medium text-danger-700">
              Single sign-on is not set up on this server. Use your email and password instead.
            </p>
          )}

          <SsoOption sso={sso} next={from} />

          <form onSubmit={handleSubmit} className={sso?.configured ? 'mt-4 space-y-4' : 'mt-8 space-y-4'}>
            <Input
              label="Email"
              type="email"
              autoComplete="email"
              autoFocus
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              aria-invalid={hasError || undefined}
              required
            />
            <Input
              label="Password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              aria-invalid={hasError || undefined}
              required
            />
            {hasError && (
              <p role="alert" aria-live="polite" className="rounded-btn bg-danger-50 px-3 py-2 text-sm font-medium text-danger-700">
                {error}
              </p>
            )}
            <Button type="submit" size="lg" loading={loading} className="w-full">
              <LogIn aria-hidden className="size-4" />
              {loading ? 'Signing in…' : 'Sign in'}
            </Button>
          </form>

          <div className="mt-8 border-t border-border pt-6">
            <p className="text-sm text-fg-muted">Want to sell on the marketplace?</p>
            <Link to="/register/owner" className="mt-1 inline-block text-sm font-bold text-brand-600 hover:underline">
              Create a store owner account →
            </Link>
          </div>
        </div>
      </section>
    </div>
  )
}
