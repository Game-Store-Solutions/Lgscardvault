import { HEX, PALETTE_DEFAULTS, type PaletteKey } from '../../components/store/branding'
import { SLUG_RE, type StepKey } from './config'
import type { OnboardingData } from './types'

/** Matches the backend's image-URL rule: http(s) URL or an absolute path. */
const IMAGE_URL_RE = /^(https?:\/\/|\/)/

const COLOR_KEYS = Object.keys(PALETTE_DEFAULTS) as PaletteKey[]

/** Whether the given step has everything it needs before advancing. */
export function isStepValid(
  key: StepKey,
  data: OnboardingData,
  ctx: { accountCreated: boolean; paymentRequired: boolean },
): boolean {
  switch (key) {
    case 'account':
      return (
        ctx.accountCreated ||
        (data.displayName.trim() !== '' && /\S+@\S+/.test(data.email) && data.password.length >= 8)
      )
    case 'address':
      return (
        data.address.addressLine1.trim() !== '' &&
        data.address.city.trim() !== '' &&
        data.address.postalCode.trim() !== '' &&
        data.address.country.trim() !== ''
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
    case 'review':
    default:
      return true
  }
}
