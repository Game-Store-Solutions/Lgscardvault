import type { PageBackgroundPreset, StorePageBackgrounds } from '../../../lib/pageBackgrounds'
import { PAGE_BACKGROUND_LABELS, PAGE_BACKGROUND_PRESETS, resolvePatternColorsForRender } from '../../../lib/pageBackgrounds'
import { cx } from '../../../lib/cx'
import { PageBackgroundLayer } from './PageBackgroundLayer'

export function BackgroundPresetPicker({
  value,
  onChange,
  mode,
  settings,
}: {
  value: PageBackgroundPreset
  onChange: (preset: PageBackgroundPreset) => void
  mode: 'light' | 'dark'
  settings?: StorePageBackgrounds
}) {
  const patternColors = settings
    ? resolvePatternColorsForRender(settings, mode === 'dark')
    : undefined

  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {PAGE_BACKGROUND_PRESETS.map((preset) => {
        const selected = value === preset
        return (
          <button
            key={preset}
            type="button"
            aria-pressed={selected}
            onClick={() => onChange(preset)}
            className={cx(
              'group overflow-hidden rounded-card border text-left transition-colors',
              selected
                ? 'border-brand-500 ring-2 ring-brand-500/30'
                : 'border-border hover:border-brand-500/40',
            )}
          >
            <div
              className={cx(
                'relative h-28 overflow-hidden bg-bg',
                mode === 'dark' ? 'dark' : 'preview-light',
              )}
            >
              <PageBackgroundLayer preset={preset} opacity={80} compact patternColors={patternColors} />
            </div>
            <div className="border-t border-border bg-surface px-3 py-2">
              <p className="text-sm font-bold text-fg">{PAGE_BACKGROUND_LABELS[preset]}</p>
              <p className="text-[11px] text-fg-muted">{preset === 'none' ? 'Uses page color only' : 'Decorative layer'}</p>
            </div>
          </button>
        )
      })}
    </div>
  )
}
