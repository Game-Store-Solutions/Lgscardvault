export type StorefrontTemplate = 'vault' | 'campaign' | 'studio'

export const STOREFRONT_TEMPLATES: StorefrontTemplate[] = ['vault', 'campaign', 'studio']

export const DEFAULT_STOREFRONT_TEMPLATE: StorefrontTemplate = 'vault'

export interface StorefrontTemplateOption {
  id: StorefrontTemplate
  title: string
  eyebrow: string
  description: string
}

export const STOREFRONT_TEMPLATE_OPTIONS: StorefrontTemplateOption[] = [
  {
    id: 'vault',
    title: 'Vault',
    eyebrow: 'Default box',
    description: 'Today’s framed storefront. Hero, shortcut tiles, spotlight, then search. Every new shop starts here.',
  },
  {
    id: 'campaign',
    title: 'Campaign',
    eyebrow: 'Findtrend energy',
    description: 'Full-bleed bands, oversized type, a game marquee, and one obvious “shop singles” action. Browse stays boxed.',
  },
  {
    id: 'studio',
    title: 'Studio',
    eyebrow: 'Instrument energy',
    description: 'Photography-first and quiet. Small labels, a curated grid, inventory as a later chapter. Browse stays boxed.',
  },
]

export function normalizeStorefrontTemplate(
  value?: string | null,
): StorefrontTemplate {
  const next = (value ?? '').trim().toLowerCase()
  if (STOREFRONT_TEMPLATES.includes(next as StorefrontTemplate)) {
    return next as StorefrontTemplate
  }
  return DEFAULT_STOREFRONT_TEMPLATE
}

export function isBoxedStorefrontTemplate(template?: string | null): boolean {
  return normalizeStorefrontTemplate(template) === 'vault'
}
