import { STEPS, stepIndex } from './config'
import { EMPTY_ONBOARDING, type OnboardingData } from './types'

const STORAGE_KEY = 'lgs-onboarding-draft-v1'
export const ONBOARDING_DRAFT_EVENT = 'lgs-onboarding-draft-change'

export type OnboardingDraft = {
  v: 1
  email: string
  step: number
  slugEdited: boolean
  data: OnboardingData
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** Rebuild wizard data from storage without carrying a password or verify code. */
export function mergeDraftData(raw: unknown): OnboardingData {
  if (!isRecord(raw)) return { ...EMPTY_ONBOARDING }

  const address = isRecord(raw.address) ? raw.address : {}
  const branding = isRecord(raw.branding) ? raw.branding : {}
  const payment = isRecord(raw.payment) ? raw.payment : {}
  const compliance = isRecord(raw.compliance) ? raw.compliance : {}

  return {
    ...EMPTY_ONBOARDING,
    ...(raw as Partial<OnboardingData>),
    password: '',
    verifyCode: '',
    address: { ...EMPTY_ONBOARDING.address, ...address },
    branding: { ...EMPTY_ONBOARDING.branding, ...branding },
    payment: { ...EMPTY_ONBOARDING.payment, ...payment },
    compliance: { ...EMPTY_ONBOARDING.compliance, ...compliance },
    complianceDocuments: Array.isArray(raw.complianceDocuments)
      ? (raw.complianceDocuments as OnboardingData['complianceDocuments'])
      : [],
  }
}

export function clampOnboardingStep(
  step: number,
  ctx: { signedIn: boolean; emailVerified: boolean },
): number {
  const max = STEPS.length - 1
  const next = Number.isFinite(step) ? Math.min(Math.max(0, Math.trunc(step)), max) : 0
  if (!ctx.signedIn) return 0
  if (!ctx.emailVerified && next > stepIndex('verify')) return stepIndex('verify')
  return next
}

export function draftBelongsTo(draft: OnboardingDraft, email?: string | null): boolean {
  const draftEmail = draft.email.trim().toLowerCase()
  const userEmail = email?.trim().toLowerCase() ?? ''
  if (!userEmail) return draftEmail === ''
  if (!draftEmail) return true
  return draftEmail === userEmail
}

export function loadOnboardingDraft(): OnboardingDraft | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as unknown
    if (!isRecord(parsed) || parsed.v !== 1) return null
    return {
      v: 1,
      email: typeof parsed.email === 'string' ? parsed.email : '',
      step: typeof parsed.step === 'number' ? parsed.step : 0,
      slugEdited: parsed.slugEdited === true,
      data: mergeDraftData(parsed.data),
    }
  } catch {
    return null
  }
}

export function saveOnboardingDraft(draft: Omit<OnboardingDraft, 'v'>): void {
  try {
    const payload: OnboardingDraft = {
      v: 1,
      email: draft.email,
      step: draft.step,
      slugEdited: draft.slugEdited,
      data: { ...draft.data, password: '', verifyCode: '' },
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload))
    window.dispatchEvent(new Event(ONBOARDING_DRAFT_EVENT))
  } catch {
    // Private mode / quota — in-memory wizard still works for this session.
  }
}

export function clearOnboardingDraft(): void {
  try {
    localStorage.removeItem(STORAGE_KEY)
    window.dispatchEvent(new Event(ONBOARDING_DRAFT_EVENT))
  } catch {
    // ignore
  }
}

/** True once the wizard has real store-setup work, not just an opened Account step. */
export function isOnboardingDraftInProgress(draft: OnboardingDraft | null | undefined): boolean {
  if (!draft) return false
  if (draft.step > 0) return true
  const data = draft.data
  return Boolean(
    data.storeName.trim() ||
      data.slug.trim() ||
      data.address.addressLine1.trim() ||
      data.planKey ||
      data.payment.token ||
      data.branding.logoUrl.trim() ||
      data.compliance.legalBusinessName.trim(),
  )
}
