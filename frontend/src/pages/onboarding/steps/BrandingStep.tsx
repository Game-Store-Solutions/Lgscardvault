import { Input, Textarea } from '../../../components/ui'
import { StorePreview } from '../../../components/store'
import { toPreviewBranding, type OnboardingData, type PatchBranding } from '../types'

export function BrandingStep({
  data,
  setStoreName,
  setSlug,
  patchBranding,
}: {
  data: OnboardingData
  setStoreName: (v: string) => void
  setSlug: (v: string) => void
  patchBranding: PatchBranding
}) {
  const b = data.branding
  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(26rem,36rem)]">
      <div className="space-y-4">
        <Input label="Store name" placeholder="Acme Cards" value={data.storeName} onChange={(e) => setStoreName(e.target.value)} required />
        <Input
          label="Store address (URL)"
          hint="Your storefront lives at /s/your-slug. Lowercase letters, numbers, and hyphens."
          value={data.slug}
          onChange={(e) => setSlug(e.target.value.toLowerCase())}
          maxLength={64}
          className="font-mono"
          required
        />
        <Input label="Logo image URL" placeholder="https://…/logo.png" value={b.logoUrl} onChange={(e) => patchBranding({ logoUrl: e.target.value })} />
        <Input label="Hero banner image URL" placeholder="https://…/banner.jpg" value={b.heroImageUrl} onChange={(e) => patchBranding({ heroImageUrl: e.target.value })} />
        <Input label="Tagline" placeholder="Your local Magic singles shop" maxLength={160} value={b.tagline} onChange={(e) => patchBranding({ tagline: e.target.value })} />
        <Input label="Hero heading" placeholder="Defaults to your store name" maxLength={160} value={b.heroHeading} onChange={(e) => patchBranding({ heroHeading: e.target.value })} />
        <Textarea label="Hero subheading" rows={2} placeholder="A sentence or two about your store." value={b.heroSubheading} onChange={(e) => patchBranding({ heroSubheading: e.target.value })} />
      </div>

      <div className="xl:sticky xl:top-8 xl:self-start">
        <p className="mb-3 text-xs font-bold uppercase tracking-wide text-fg-muted">Live preview</p>
        <StorePreview branding={toPreviewBranding(b)} storeName={data.storeName || 'Your store'} />
      </div>
    </div>
  )
}

export default BrandingStep
