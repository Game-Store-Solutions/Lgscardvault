import { HEX, PALETTE_DEFAULTS, type PaletteKey } from '../../components/store/branding'
import { NO_STATE_SALES_TAX, SLUG_RE, type StepKey } from './config'
import type { OnboardingData } from './types'

/** Matches the backend's image-URL rule: http(s) URL or an absolute path. */
const IMAGE_URL_RE = /^(https?:\/\/|\/)/

const COLOR_KEYS = Object.keys(PALETTE_DEFAULTS) as PaletteKey[]

export function isAtLeast13(isoDate: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) return false
  const dob = new Date(`${isoDate}T00:00:00`)
  if (Number.isNaN(dob.getTime())) return false
  const today = new Date()
  let age = today.getFullYear() - dob.getFullYear()
  const monthDelta = today.getMonth() - dob.getMonth()
  if (monthDelta < 0 || (monthDelta === 0 && today.getDate() < dob.getDate())) age -= 1
  return age >= 13 && age <= 120
}

function licensesValid(data: OnboardingData): boolean {
  const c = data.compliance
  if (!c.legalBusinessName.trim() || !c.entityType || !c.insuranceAttested) return false
  const region = data.address.region.trim().toUpperCase()
  const noTax = NO_STATE_SALES_TAX.includes(region)
  if (noTax) {
    if (!c.noStateSalesTax) return false
  } else {
    const hasPermit =
      c.sellerPermitNumber.trim() !== '' || data.complianceDocuments.some((d) => d.kind === 'seller_permit')
    if (!hasPermit) return false
  }
  if (c.usesBuyTrade) {
    if (c.secondhandStatus === 'not_applicable') return false
    if (c.secondhandStatus === 'licensed') {
      const hasLicense =
        c.secondhandLicenseNumber.trim() !== '' || data.complianceDocuments.some((d) => d.kind === 'secondhand')
      if (!hasLicense) return false
    }
  }
  return true
}

/** Whether the given step has everything it needs before advancing. */
export function isStepValid(
  key: StepKey,
  data: OnboardingData,
  ctx: { accountCreated: boolean; paymentRequired: boolean; emailVerified?: boolean },
): boolean {
  switch (key) {
    case 'account':
      return (
        ctx.accountCreated ||
        (data.displayName.trim() !== '' &&
          /\S+@\S+/.test(data.email) &&
          data.password.length >= 8 &&
          data.acceptedTerms &&
          isAtLeast13(data.dateOfBirth))
      )
    case 'verify':
      return Boolean(ctx.emailVerified) || /^\d{6}$/.test(data.verifyCode.trim())
    case 'address':
      return (
        data.address.addressLine1.trim() !== '' &&
        data.address.city.trim() !== '' &&
        data.address.region.trim() !== '' &&
        data.address.postalCode.trim() !== '' &&
        data.address.country.trim().toUpperCase() === 'US'
      )
    case 'branding':
      return (
        data.storeName.trim() !== '' &&
        SLUG_RE.test(data.slug) &&
        data.slug.length <= 64 &&
        [data.branding.logoUrl, data.branding.heroImageUrl].every(
          (url) => url.trim() === '' || IMAGE_URL_RE.test(url.trim()),
        )
      )
    // Empty colors fall back to the platform theme; anything typed must be valid hex.
    case 'colors':
      return COLOR_KEYS.every((k) => {
        const value = data.branding[k].trim()
        return value === '' || HEX.test(value)
      })
    case 'plan':
      return Boolean(data.planKey)
    case 'payment':
      return !ctx.paymentRequired || (data.payment.methodType !== '' && data.payment.token !== '')
    case 'licenses':
      return licensesValid(data)
    case 'review':
      return data.acceptedMerchantTerms
    default:
      return true
  }
}
