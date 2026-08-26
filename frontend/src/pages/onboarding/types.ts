import type { CardDisplayStyle, ComplianceDocumentMeta, PaymentMethodType } from '../../api/types'
import type { StorePreviewBranding } from '../../components/store'

export interface OnboardingBranding {
  primaryColor: string
  accentColor: string
  backgroundColor: string
  surfaceColor: string
  textColor: string
  mutedColor: string
  borderColor: string
  logoUrl: string
  heroImageUrl: string
  heroHeading: string
  heroSubheading: string
  tagline: string
  cardDisplayStyle: CardDisplayStyle
}

export interface OnboardingAddress {
  addressLine1: string
  addressLine2: string
  city: string
  region: string
  postalCode: string
  country: string
  latitude: number | null
  longitude: number | null
}

export interface OnboardingPayment {
  methodType: PaymentMethodType | ''
  /** Square payment token or PayPal order id, depending on methodType. */
  token: string
  last4: string
  /** Optional Strong Customer Authentication token from verifyBuyer(). */
  verificationToken: string
}

export interface OnboardingCompliance {
  legalBusinessName: string
  entityType: '' | 'sole_prop' | 'llc' | 'corp' | 'partnership' | 'other'
  sellerPermitNumber: string
  ein: string
  noStateSalesTax: boolean
  cityLicenseNumber: string
  usesBuyTrade: boolean
  secondhandStatus: 'not_applicable' | 'will_comply' | 'licensed'
  secondhandLicenseNumber: string
  insuranceAttested: boolean
}

export interface OnboardingData {
  // Account
  displayName: string
  email: string
  password: string
  // Store identity
  storeName: string
  slug: string
  phone: string
  // Steps
  address: OnboardingAddress
  branding: OnboardingBranding
  planKey: string
  payment: OnboardingPayment
  acceptedTerms: boolean
  dateOfBirth: string
  verifyCode: string
  acceptedMerchantTerms: boolean
  compliance: OnboardingCompliance
  complianceDocuments: ComplianceDocumentMeta[]
}

export const EMPTY_ONBOARDING: OnboardingData = {
  displayName: '',
  email: '',
  password: '',
  storeName: '',
  slug: '',
  phone: '',
  address: {
    addressLine1: '',
    addressLine2: '',
    city: '',
    region: '',
    postalCode: '',
    country: 'US',
    latitude: null,
    longitude: null,
  },
  branding: {
    primaryColor: '',
    accentColor: '',
    backgroundColor: '',
    surfaceColor: '',
    textColor: '',
    mutedColor: '',
    borderColor: '',
    logoUrl: '',
    heroImageUrl: '',
    heroHeading: '',
    heroSubheading: '',
    tagline: '',
    cardDisplayStyle: 'gallery',
  },
  planKey: '',
  payment: { methodType: '', token: '', last4: '', verificationToken: '' },
  acceptedTerms: false,
  dateOfBirth: '',
  verifyCode: '',
  acceptedMerchantTerms: false,
  compliance: {
    legalBusinessName: '',
    entityType: '',
    sellerPermitNumber: '',
    ein: '',
    noStateSalesTax: false,
    cityLicenseNumber: '',
    usesBuyTrade: false,
    secondhandStatus: 'not_applicable',
    secondhandLicenseNumber: '',
    insuranceAttested: false,
  },
  complianceDocuments: [],
}

/** Shared state-updater signatures, so step components stay terse. */
export type Patch = (partial: Partial<OnboardingData>) => void
export type PatchAddress = (partial: Partial<OnboardingAddress>) => void
export type PatchBranding = (partial: Partial<OnboardingBranding>) => void
export type PatchPayment = (partial: Partial<OnboardingPayment>) => void

/** OnboardingBranding is a structural superset of the preview's branding shape. */
export function toPreviewBranding(b: OnboardingBranding): StorePreviewBranding {
  return b
}

/** Turn a store name into a URL-safe slug candidate. */
export function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64)
}
