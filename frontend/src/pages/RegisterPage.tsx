import { useState } from 'react'
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router'
import { Info, UserPlus } from 'lucide-react'
import { useStore } from '../hooks'
import { Button, Input } from '../components/ui'
import AuthMarketingAside from '../components/AuthMarketingAside'
import { BrandLogo } from '../components/BrandLogo'
import { SsoOption, useSsoStatus } from '../components/SsoOption'
import { useAuth } from '../context/AuthContext'

interface RegisterPageProps {
  accountType: 'owner' | 'customer'
}

const COPY = {
  owner: {
    eyebrow: 'Sell on the marketplace',
    title: 'Create owner account',
    description: 'Manage store inventory, orders, and branding once a platform admin provisions your store.',
    button: 'Create owner account',
    loading: 'Creating owner account…',
    alternateText: 'Just here to shop?',
    alternateLabel: 'Create a shopper account',
    alternateTo: '/register/customer',
    asideEyebrow: 'For store owners',
    asideDescription:
      'Run your storefront: list inventory, track orders, brand your page, and reach buyers across the marketplace.',
  },
  customer: {
    eyebrow: 'Join the marketplace',
    title: 'Create your account',
    description: 'Save favorites, build a want list, and sign in quickly on any storefront.',
    button: 'Create account',
    loading: 'Creating account…',
    alternateText: 'Want to sell instead?',
    alternateLabel: 'Create a store owner account',
    alternateTo: '/register/owner',
    asideEyebrow: 'Join the marketplace',
    asideDescription:
      'Build one account that follows you across every storefront. Favorites, want lists, and a faster checkout.',
  },
} as const

export default function RegisterPage({ accountType }: RegisterPageProps) {
  const { register } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [searchParams] = useSearchParams()
  const storeSlug = searchParams.get('store') ?? ''
  const { data: store } = useStore(storeSlug)
  const copy = COPY[accountType]
  const [displayName, setDisplayName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [acceptedTerms, setAcceptedTerms] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const sso = useSsoStatus()

  const fallback = storeSlug ? `/s/${storeSlug}` : '/'
  const from = (location.state as { from?: string } | null)?.from ?? fallback

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    setError('')
    setLoading(true)
    try {
      sessionStorage.setItem('verify-next', from)
      await register(email, password, displayName, accountType, acceptedTerms)
      const sent = new URLSearchParams({ email })
      if (storeSlug) sent.set('store', storeSlug)
      navigate(`/verify-email/sent?${sent.toString()}`)
    } catch (e) {
      const message =
        (e as { response?: { data?: { error?: string } } })?.response?.data?.error ??
        'Registration failed. Email may already be in use.'
      setError(message)
    } finally {
      setLoading(false)
    }
  }

  const hasError = Boolean(error)

  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <AuthMarketingAside
        eyebrow={copy.asideEyebrow}
        storeName={store?.name}
        description={copy.asideDescription}
      />

      <section className="flex items-center justify-center px-6 py-16 sm:px-10">
        <div className="w-full max-w-sm">
          <div className="mb-8 lg:hidden">
            <BrandLogo size="md" withWordmark />
          </div>

          <p className="text-xs font-bold uppercase tracking-[0.2em] text-brand-600">{copy.eyebrow}</p>
          <h1 className="mt-2 font-display text-3xl font-bold tracking-tight text-fg">{copy.title}</h1>
          <p className="mt-2 text-sm text-fg-muted">
            Already have an account?{' '}
            <Link to="/login" className="font-bold text-brand-600 hover:underline">
              Sign in
            </Link>
          </p>

          {accountType === 'owner' && (
            <div className="mt-6 flex gap-2 rounded-card border border-border bg-bg p-3 text-sm text-fg-muted">
              <Info aria-hidden className="mt-0.5 size-4 flex-shrink-0 text-brand-600" />
              <p>
                <span className="font-bold text-fg">What happens next:</span> after you sign up, a platform admin
                provisions your store. Once it's live, you'll see <span className="font-bold text-fg">My store</span>{' '}
                in the top navigation.
              </p>
            </div>
          )}

          <SsoOption sso={sso} next={from} />

          <form onSubmit={handleSubmit} className={sso?.configured ? 'mt-4 space-y-4' : 'mt-8 space-y-4'}>
            <Input
              label="Display name"
              autoComplete="name"
              autoFocus
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              aria-invalid={hasError || undefined}
              required
            />
            <Input
              label="Email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              aria-invalid={hasError || undefined}
              required
            />
            <Input
              label="Password"
              type="password"
              autoComplete="new-password"
              hint="At least 8 characters."
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              minLength={8}
              aria-invalid={hasError || undefined}
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
                . I am at least 13.
              </span>
            </label>
            {hasError && (
              <p role="alert" aria-live="polite" className="rounded-btn bg-danger-50 px-3 py-2 text-sm font-medium text-danger-700">
                {error}
              </p>
            )}
            <Button type="submit" size="lg" loading={loading} className="w-full" disabled={!acceptedTerms}>
              <UserPlus aria-hidden className="size-4" />
              {loading ? copy.loading : copy.button}
            </Button>
          </form>

          <div className="mt-8 border-t border-border pt-6">
            <p className="text-sm text-fg-muted">{copy.alternateText}</p>
            <Link to={copy.alternateTo} className="mt-1 inline-block text-sm font-bold text-brand-600 hover:underline">
              {copy.alternateLabel} →
            </Link>
          </div>
        </div>
      </section>
    </div>
  )
}
