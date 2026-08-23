import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import api, { extractErrorMessage } from '../../api/client'
import type { GeocodeSuggestion, Plan } from '../../api/types'
import { useAuth } from '../../context/AuthContext'
import { STEPS, stepIndex } from './config'
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
  const { register, user, refreshUser, loginWithToken } = useAuth()

  const [data, setData] = useState<OnboardingData>(() => ({
    ...EMPTY_ONBOARDING,
    displayName: user?.displayName ?? '',
    email: user?.email ?? '',
  }))
  const [step, setStep] = useState(0)
  const [accountCreated, setAccountCreated] = useState(Boolean(user))
  const [emailVerified, setEmailVerified] = useState(Boolean(user?.emailVerified))
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
    if (user.emailVerified) {
      setEmailVerified(true)
    }
    setData((d) => ({
      ...d,
      displayName: d.displayName || (user.displayName ?? ''),
      email: d.email || user.email,
    }))
  }, [user])

  const plansQuery = useQuery({
    queryKey: ['plans'],
    queryFn: async () => {
      const { data } = await api.get<{ plans: Plan[] }>('/plans')
      return data.plans
    },
    enabled: Boolean(user),
  })
  const plans = plansQuery.data ?? []
  const selectedPlan = plans.find((p) => p.key === data.planKey)
  const paymentRequired = (selectedPlan?.priceCents ?? 0) > 0

  const patch = (partial: Partial<OnboardingData>) => setData((d) => ({ ...d, ...partial }))
  const patchAddress = (partial: Partial<OnboardingAddress>) =>
    setData((d) => ({ ...d, address: { ...d.address, ...partial } }))
  const patchBranding = (partial: Partial<OnboardingBranding>) =>
    setData((d) => ({ ...d, branding: { ...d.branding, ...partial } }))
  const patchPayment = (partial: Partial<OnboardingPayment>) =>
    setData((d) => ({ ...d, payment: { ...d.payment, ...partial } }))

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

  function goToAfterAccount() {
    setStep(emailVerified ? stepIndex('address') : stepIndex('verify'))
  }

  async function goNext() {
    setError('')
    const key = STEPS[step].key

    if (key === 'account' && !accountCreated) {
      setBusy(true)
      try {
        await register(data.email, data.password, data.displayName, 'owner', data.acceptedTerms, data.dateOfBirth)
        setAccountCreated(true)
        setEmailVerified(false)
        setStep(stepIndex('verify'))
      } catch (e) {
        setError(extractErrorMessage(e, 'Could not create your account. The email may already be in use.'))
      } finally {
        setBusy(false)
      }
      return
    }

    if (key === 'account') {
      goToAfterAccount()
      return
    }

    if (key === 'verify' && !emailVerified) {
      setBusy(true)
      try {
        const { data: verified } = await api.post<{ token: string }>('/auth/verify-email', {
          email: data.email.trim(),
          code: data.verifyCode.trim(),
        })
        await loginWithToken(verified.token)
        setEmailVerified(true)
        setStep(stepIndex('address'))
      } catch (e) {
        setError(extractErrorMessage(e, 'That code is invalid or has expired.'))
      } finally {
        setBusy(false)
      }
      return
    }

    setStep((s) => Math.min(s + 1, STEPS.length - 1))
  }

  function goBack() {
    setError('')
    if (STEPS[step].key === 'address' && emailVerified) {
      setStep(stepIndex('account'))
      return
    }
    setStep((s) => Math.max(s - 1, 0))
  }

  function jumpTo(index: number) {
    if (!emailVerified && index > stepIndex('verify')) {
      setStep(stepIndex('verify'))
      return
    }
    setStep(index)
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
        compliance: data.compliance,
        documentIds: data.complianceDocuments.map((d) => d.id),
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
  const canProceed = isStepValid(currentKey, data, { accountCreated, paymentRequired, emailVerified })

  return {
    data,
    step,
    currentKey,
    isLast,
    canProceed,
    busy,
    error,
    submitted,
    accountCreated,
    emailVerified,
    plans,
    plansLoading: plansQuery.isLoading,
    selectedPlan,
    paymentRequired,
    patch,
    patchAddress,
    patchBranding,
    patchPayment,
    setStoreName,
    setSlug,
    applyAddress,
    goNext,
    goBack,
    submit,
    jumpTo,
  }
}
