import { StorePreview } from '../../../components/store'
import { ColorField, PALETTE_DEFAULTS, ThemePresetPicker, type ThemePreset } from '../../../components/store/branding'
import { toPreviewBranding, type OnboardingData, type PatchBranding } from '../types'

export function ColorsStep({ data, patchBranding }: { data: OnboardingData; patchBranding: PatchBranding }) {
  const b = data.branding

  const applyPreset = (preset: ThemePreset) => patchBranding(preset.palette)

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(26rem,36rem)]">
      <div className="space-y-6">
        <div>
          <p className="mb-1 text-sm font-bold text-fg">Store theme library</p>
          <p className="mb-3 text-xs text-fg-muted">MTG-native mana and guild palettes, plus signature moods. Expand a category to choose one.</p>
          <ThemePresetPicker onSelect={applyPreset} />
        </div>
        <div className="grid gap-5 border-t border-border pt-6 sm:grid-cols-2">
          <ColorField label="Primary / button" value={b.primaryColor} fallback={PALETTE_DEFAULTS.primaryColor} onChange={(v) => patchBranding({ primaryColor: v })} />
          <ColorField label="Accent" value={b.accentColor} fallback={PALETTE_DEFAULTS.accentColor} onChange={(v) => patchBranding({ accentColor: v })} />
          <ColorField label="Page background" value={b.backgroundColor} fallback={PALETTE_DEFAULTS.backgroundColor} onChange={(v) => patchBranding({ backgroundColor: v })} />
          <ColorField label="Card / surface" value={b.surfaceColor} fallback={PALETTE_DEFAULTS.surfaceColor} onChange={(v) => patchBranding({ surfaceColor: v })} />
          <ColorField label="Text" value={b.textColor} fallback={PALETTE_DEFAULTS.textColor} onChange={(v) => patchBranding({ textColor: v })} />
          <ColorField label="Muted text" value={b.mutedColor} fallback={PALETTE_DEFAULTS.mutedColor} onChange={(v) => patchBranding({ mutedColor: v })} />
          <ColorField label="Border" value={b.borderColor} fallback={PALETTE_DEFAULTS.borderColor} onChange={(v) => patchBranding({ borderColor: v })} />
        </div>
      </div>

      <div className="xl:sticky xl:top-8 xl:self-start">
        <p className="mb-3 text-xs font-bold uppercase tracking-wide text-fg-muted">Live preview</p>
        <StorePreview branding={toPreviewBranding(b)} storeName={data.storeName || 'Your store'} />
      </div>
    </div>
  )
}

export default ColorsStep
