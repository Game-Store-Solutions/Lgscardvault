import {
  CheckCircle2,
  CreditCard,
  Image as ImageIcon,
  Layers,
  MapPin,
  Palette as PaletteIcon,
  ShieldCheck,
  UserPlus,
} from 'lucide-react'
import type { PaymentMethodType } from '../../api/types'

/** The ordered wizard steps. Order here drives the stepper and navigation. */
export const STEPS = [
  { key: 'account', title: 'Account', icon: UserPlus },
  { key: 'address', title: 'Address', icon: MapPin },
  { key: 'branding', title: 'Branding', icon: ImageIcon },
  { key: 'colors', title: 'Colors', icon: PaletteIcon },
  { key: 'plan', title: 'Plan', icon: Layers },
  { key: 'payment', title: 'Payment', icon: CreditCard },
  { key: 'licenses', title: 'Licenses', icon: ShieldCheck },
  { key: 'review', title: 'Review', icon: CheckCircle2 },
] as const

export type StepKey = (typeof STEPS)[number]['key']

/** Position of a step in the wizard, so jumps survive reordering STEPS. */
export function stepIndex(key: StepKey): number {
  return STEPS.findIndex((s) => s.key === key)
}

export const STEP_SUBTITLE: Record<StepKey, string> = {
  account: 'Create the owner account that manages this store.',
  address: 'Physical U.S. storefront. Shoppers pay online and pick up in store.',
  branding: 'Name your store and add a logo. Watch the preview update live.',
  colors: 'Pick a palette. Everything on your storefront retones instantly.',
  plan: 'Choose the tier that fits your shop.',
  payment: 'Add a payment method for your subscription.',
  licenses: 'Seller’s permit, city license, entity, and insurance attestation.',
  review: 'Review everything, then submit for platform review.',
}

export const METHOD_LABELS: Record<PaymentMethodType, string> = {
  card: 'Credit / debit card',
  apple_pay: 'Apple Pay',
  google_pay: 'Google Pay',
}

export const SLUG_RE = /^[a-z0-9-]+$/

/** States with no statewide sales tax (local Square tax may still apply). */
export const NO_STATE_SALES_TAX = ['AK', 'DE', 'MT', 'NH', 'OR'] as const
