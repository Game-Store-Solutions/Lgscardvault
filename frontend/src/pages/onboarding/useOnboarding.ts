import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router'
import { useQuery } from '@tanstack/react-query'
import api, { extractErrorMessage } from '../../api/client'
import type { GeocodeSuggestion, Plan } from '../../api/types'
import { useAuth } from '../../context/AuthContext'
import { STEPS } from './config'
import { isStepValid } from './validation'
import {
  EMPTY_ONBOARDING,
  slugify,
  type OnboardingAddress,
  type OnboardingBranding,
  type OnboardingData,
  type OnboardingPayment,
} from './types'

/**
 * All onboarding state and behaviour in one place. The wizard component stays a
 * thin view: it reads this hook's values and wires actions to buttons/steps.
 */
export function useOnboarding() {
  const { register, user, refreshUser } = useAuth()
  const navigate = useNavigate()

  const [data, setData] = useState<OnboardingData>(() => ({
    ...EMPTY_ONBOARDING,
    displayName: user?.displayName ?? '',
    email: user?.email ?? '',
  }))
  const [step, setStep] = useState(0)
  const [accountCreated, setAccountCreated] = useState(Boolean(user))
  const [slugEdited, setSlugEdited] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [submitted, setSubmitted] = useState<{ name: string; slug: string } | null>(null)

  // AuthContext resolves the user asynchronously (via /me), so on a direct
  // page load a signed-in owner appears anonymous at first render. Catch up
  // once the user arrives: skip account creation and prefill their details.
  useEffect(() => {
    if (!user) return
    setAccountCreated(true)
    setData((d) => ({
      ...d,
      displayName: d.displayName || (user.displayName ?? ''),
      email: d.email || user.email,
    }))
  }, [user])

  // Only fetch plans once the owner is authenticated — the /plans endpoint
  // requires auth, and firing it on the (pre-login) account step would 401 and
  // bounce the user to /login via the axios interceptor.
  const plansQuery = useQuery({
    queryKey: ['plans'],
    queryFn: async () => {
      const { data } = await api.get<{ plans: Plan[] }>('/plans')
      return data.plans
    },
    enabled: accountCreated,
  })
  const plans = plansQuery.data ?? []
  const selectedPlan = plans.find((p) => p.key === data.planKey)
  const paymentRequired = (selectedPlan?.priceCents ?? 0) > 0

  // --- state updaters ---
  const patch = (partial: Partial<OnboardingData>) => setData((d) => ({ ...d, ...partial }))
  const patchAddress = (partial: Partial<OnboardingAddress>) =>
    setData((d) => ({ ...d, address: { ...d.address, ...partial } }))
  const patchBranding = (partial: Partial<OnboardingBranding>) =>
    setData((d) => ({ ...d, branding: { ...d.branding, ...partial } }))
  const patchPayment = (partial: Partial<OnboardingPayment>) =>
    setData((d) => ({ ...d, payment: { ...d.payment, ...partial } }))

  // Store name auto-derives the slug until the owner edits the slug directly.
  const setStoreName = (name: string) =>
    setData((d) => ({ ...d, storeName: name, slug: slugEdited ? d.slug : slugify(name) }))
  const setSlug = (value: string) => {
    setSlugEdited(true)
    patch({ slug: value })
  }

  const applyAddress = (s: GeocodeSuggestion) =>
    patchAddress({
      addressLine1: s.addressLine1,
      city: s.city,
      region: s.region,
      postalCode: s.postalCode,
      country: 'US',
      latitude: s.latitude,
      longitude: s.longitude,
    })

  // --- navigation ---
  async function goNext() {
    setError('')
    // The account step provisions the user so every later request is authenticated.
    if (STEPS[step].key === 'account' && !accountCreated) {
      setBusy(true)
      try {
        sessionStorage.setItem('verify-next', '/register/owner')
        await register(data.email, data.password, data.displayName, 'owner', data.acceptedTerms)
        navigate(`/verify-email/sent?email=${encodeURIComponent(data.email)}`)
        return
      } catch (e) {
        setError(extractErrorMessage(e, 'Could not create your account. The email may already be in use.'))
        setBusy(false)
        return
      }
    }
    setStep((s) => Math.min(s + 1, STEPS.length - 1))
  }

  function goBack() {
    setError('')
    setStep((s) => Math.max(s - 1, 0))
  }

  async function submit() {
    setError('')
    setBusy(true)
    try {
      await api.post('/onboarding/store', {
        name: data.storeName,
        slug: data.slug,
        phone: data.phone,
        planKey: data.planKey,
        address: data.address,
        branding: data.branding,
        payment: paymentRequired
          ? {
              methodType: data.payment.methodType,
              token: data.payment.token,
              last4: data.payment.last4,
              verificationToken: data.payment.verificationToken,
            }
          : {},
        acceptedMerchantTerms: data.acceptedMerchantTerms,
      })
      await refreshUser()
      setSubmitted({ name: data.storeName, slug: data.slug })
    } catch (e) {
      setError(
        extractErrorMessage(e, 'Something went wrong submitting your store. Please review your details and try again.'),
      )
    } finally {
      setBusy(false)
    }
  }

  const currentKey = STEPS[step].key
  const isLast = step === STEPS.length - 1
  const canProceed = isStepValid(currentKey, data, { accountCreated, paymentRequired })

  return {
    // state
    data,
    step,
    currentKey,
    isLast,
    canProceed,
    busy,
    error,
    submitted,
    accountCreated,
    // plans
    plans,
    plansLoading: plansQuery.isLoading,
    selectedPlan,
    paymentRequired,
    // updaters
    patch,
    patchAddress,
    patchBranding,
    patchPayment,
    setStoreName,
    setSlug,
    applyAddress,
    // navigation
    goNext,
    goBack,
    submit,
    jumpTo: setStep,
  }
}
