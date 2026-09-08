import { useEffect, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import {
  ONBOARDING_DRAFT_EVENT,
  draftBelongsTo,
  loadOnboardingDraft,
  type OnboardingDraft,
} from '../pages/onboarding/draftStorage'

/** Live onboarding draft for this browser, scoped to the signed-in email when present. */
export function useOnboardingDraft(): OnboardingDraft | null {
  const { user } = useAuth()
  const [draft, setDraft] = useState<OnboardingDraft | null>(() => loadOnboardingDraft())

  useEffect(() => {
    const sync = () => setDraft(loadOnboardingDraft())
    window.addEventListener('storage', sync)
    window.addEventListener(ONBOARDING_DRAFT_EVENT, sync)
    return () => {
      window.removeEventListener('storage', sync)
      window.removeEventListener(ONBOARDING_DRAFT_EVENT, sync)
    }
  }, [])

  if (!draft) return null
  if (!draftBelongsTo(draft, user?.email)) return null
  return draft
}
