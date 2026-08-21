import type { CSSProperties } from 'react'
import { useMemo, useState } from 'react'
import { Heart, ImageOff, Moon, Search, ShoppingCart, Sun } from 'lucide-react'
import type { CardDisplayStyle, HeroLayout, StoreCommunityEvents } from '../../api/types'
import { Badge, Button, FilterPill } from '../ui'
import { GENERIC_MTG_CARDS } from './hero/heroCardPool'
import { normalizeHeroLayout } from './hero/heroLayouts'
import { StoreHero } from './StoreHero'
import { inheritFrameStyles, resolveFrameStyles, storeFrameClass, storeThemeVars, type StorePalette } from '../../lib/storeTheme'
import {
  PAGE_BACKGROUND_LABELS,
  resolvePatternColorsForRender,
  resolveActiveBackgroundPreset,
  resolvePageBackgrounds,
  type StorePageBackgrounds,
} from '../../lib/pageBackgrounds'
import { PageBackgroundLayer } from './backgrounds/PageBackgroundLayer'
import { cx } from '../../lib/cx'

/** Fallbacks that mirror the platform default theme (index.css). */
const FALLBACK_BG = '#f7f8fa'
const FALLBACK_FG = '#0f172a'

const PREVIEW_COMMUNITY_EVENTS: StoreCommunityEvents = {
  boardHeading: 'Community board',
  boardIntro: 'FNM, drafts, and commander nights.',
  items: [
    {
      id: 'preview-fnm',
      title: 'Friday Night Magic',
      startsAt: new Date(Date.now() + 2 * 86400000).toISOString(),
      location: 'Main play area',
      pinned: true,
    },
    {
      id: 'preview-cmd',
      title: 'Commander pods',
      startsAt: new Date(Date.now() + 5 * 86400000).toISOString(),
    },
  ],
}

const HEX = /^#[0-9a-fA-F]{6}$/

/** Dark neutrals when previewing dark mode before any dark palette is configured. */
const PREVIEW_DARK_NEUTRALS: StorePalette = {
  backgroundColor: '#0f1220',
  surfaceColor: '#171b2e',
  textColor: '#f5f6fb',
  mutedColor: '#aab0cb',
  borderColor: '#2a2f47',
}

export type StorePreviewDarkColors = Partial<
  Record<
    'primaryColor' | 'accentColor' | 'backgroundColor' | 'surfaceColor' | 'textColor' | 'mutedColor' | 'borderColor',
    string
  >
>

export interface StorePreviewBranding {
  primaryColor?: string | null
  accentColor?: string | null
  backgroundColor?: string | null
  surfaceColor?: string | null
  textColor?: string | null
  mutedColor?: string | null
  borderColor?: string | null
  borderThickness?: number | null
  surfaceBlur?: number | null
  borderGlow?: number | null
  frameStyles?: StorePalette['frameStyles']
  darkFrameStyles?: StorePalette['frameStyles']
  pageBackgrounds?: StorePageBackgrounds | null
  darkColors?: StorePreviewDarkColors | null
  logoUrl?: string | null
  heroImageUrl?: string | null
  heroHeading?: string | null
  heroSubheading?: string | null
  tagline?: string | null
  cardDisplayStyle?: CardDisplayStyle
  heroLayout?: HeroLayout
  showcaseCards?: import('./hero/heroCardPool').HeroCardImage[]
}

function normHex(value?: string | null): string | undefined {
  const trimmed = value?.trim()
  return trimmed && HEX.test(trimmed) ? trimmed : undefined
}

function hasConfiguredDarkPalette(dark?: StorePreviewDarkColors | null): boolean {
  if (!dark) return false
  return Object.values(dark).some((v) => normHex(v))
}

/** Same merge rules as useStoreTheme — light base with dark overrides when set. */
export function resolvePreviewPalette(branding: StorePreviewBranding, mode: 'light' | 'dark'): StorePalette {
  const lightFrames = resolveFrameStyles(branding.frameStyles, {
    borderThickness: branding.borderThickness ?? undefined,
    borderGlow: branding.borderGlow ?? undefined,
    surfaceBlur: branding.surfaceBlur ?? undefined,
  })
  const frameStyles = mode === 'dark'
    ? inheritFrameStyles(branding.darkFrameStyles, lightFrames)
    : branding.frameStyles

  if (mode === 'light') {
    return {
      primaryColor: branding.primaryColor,
      accentColor: branding.accentColor,
      backgroundColor: branding.backgroundColor,
      surfaceColor: branding.surfaceColor,
      textColor: branding.textColor,
      mutedColor: branding.mutedColor,
      borderColor: branding.borderColor,
      borderThickness: branding.borderThickness,
      surfaceBlur: branding.surfaceBlur,
      borderGlow: branding.borderGlow,
      frameStyles,
    }
  }

  const dark = branding.darkColors ?? {}
  if (hasConfiguredDarkPalette(dark)) {
    const pick = (darkKey: keyof StorePreviewDarkColors, lightKey: keyof StorePreviewBranding) =>
      normHex(dark[darkKey]) ?? normHex(branding[lightKey] as string | null | undefined)

    return {
      primaryColor: pick('primaryColor', 'primaryColor') ?? branding.primaryColor,
      accentColor: pick('accentColor', 'accentColor') ?? branding.accentColor,
      backgroundColor: pick('backgroundColor', 'backgroundColor') ?? PREVIEW_DARK_NEUTRALS.backgroundColor,
      surfaceColor: pick('surfaceColor', 'surfaceColor') ?? PREVIEW_DARK_NEUTRALS.surfaceColor,
      textColor: pick('textColor', 'textColor') ?? PREVIEW_DARK_NEUTRALS.textColor,
      mutedColor: pick('mutedColor', 'mutedColor') ?? PREVIEW_DARK_NEUTRALS.mutedColor,
      borderColor: pick('borderColor', 'borderColor') ?? PREVIEW_DARK_NEUTRALS.borderColor,
      borderThickness: branding.borderThickness,
      surfaceBlur: branding.surfaceBlur,
      borderGlow: branding.borderGlow,
      frameStyles,
    }
  }

  return {
    primaryColor: branding.primaryColor,
    accentColor: branding.accentColor,
    ...PREVIEW_DARK_NEUTRALS,
    borderThickness: branding.borderThickness,
    surfaceBlur: branding.surfaceBlur,
    borderGlow: branding.borderGlow,
    frameStyles,
  }
}

export function ThemeModeSwitch({
  mode,
  onChange,
  label = 'Color mode',
}: {
  mode: 'light' | 'dark'
  onChange: (mode: 'light' | 'dark') => void
  label?: string
}) {
  return (
    <div
      className="inline-flex rounded-btn border border-border bg-surface p-0.5 text-xs font-bold"
      role="group"
      aria-label={label}
    >
      <button
        type="button"
        aria-pressed={mode === 'light'}
        className={cx(
          'inline-flex items-center gap-1 rounded-[calc(var(--radius-btn)-2px)] px-2 py-1 transition-colors',
          mode === 'light' ? 'bg-brand-500 text-white' : 'text-fg-muted hover:text-fg',
        )}
        onClick={() => onChange('light')}
      >
        <Sun aria-hidden className="size-3.5" />
        Light
      </button>
      <button
        type="button"
        aria-pressed={mode === 'dark'}
        className={cx(
          'inline-flex items-center gap-1 rounded-[calc(var(--radius-btn)-2px)] px-2 py-1 transition-colors',
          mode === 'dark' ? 'bg-brand-500 text-white' : 'text-fg-muted hover:text-fg',
        )}
        onClick={() => onChange('dark')}
      >
        <Moon aria-hidden className="size-3.5" />
        Dark
      </button>
    </div>
  )
}

/**
 * StorePreview — a scaled-down, live mock of the storefront. The in-progress
 * palette is scoped to this container by overriding the design-token CSS
 * variables; every primitive inside (Button, Card, Badge, FilterPill, hero)
 * reads those tokens, so the whole preview retones instantly as the owner edits
 * — before anything is saved. Shared by the branding admin tab and the
 * onboarding wizard so both show an identical storefront.
 */
export function StorePreview({
  branding,
  storeName,
  showModeToggle = true,
  previewMode: previewModeProp,
  onPreviewModeChange,
}: {
  branding: StorePreviewBranding
  storeName: string
  /** Light/dark preview toggle (on by default in admin branding). */
  showModeToggle?: boolean
  previewMode?: 'light' | 'dark'
  onPreviewModeChange?: (mode: 'light' | 'dark') => void
}) {
  const [internalMode, setInternalMode] = useState<'light' | 'dark'>('light')
  const previewMode = previewModeProp ?? internalMode
  const setPreviewMode = (mode: 'light' | 'dark') => {
    onPreviewModeChange?.(mode)
    if (previewModeProp === undefined) setInternalMode(mode)
  }

  const effectivePalette = useMemo(
    () => resolvePreviewPalette(branding, previewMode),
    [branding, previewMode],
  )

  const forceDark = previewMode === 'dark'
  const previewPalette = {
    ...effectivePalette,
    backgroundColor:
      effectivePalette.backgroundColor
      || (previewMode === 'dark' ? PREVIEW_DARK_NEUTRALS.backgroundColor : FALLBACK_BG),
    surfaceColor:
      effectivePalette.surfaceColor
      || (previewMode === 'dark' ? PREVIEW_DARK_NEUTRALS.surfaceColor : '#ffffff'),
    textColor:
      effectivePalette.textColor
      || (previewMode === 'dark' ? PREVIEW_DARK_NEUTRALS.textColor : FALLBACK_FG),
    mutedColor:
      effectivePalette.mutedColor
      || (previewMode === 'dark' ? PREVIEW_DARK_NEUTRALS.mutedColor : '#64748b'),
    borderColor:
      effectivePalette.borderColor
      || (previewMode === 'dark' ? PREVIEW_DARK_NEUTRALS.borderColor : '#e7e9ee'),
  }

  const vars = storeThemeVars(previewPalette, forceDark)
  const themeStyle = {
    ...vars,
    backgroundColor: vars['--color-bg'] ?? previewPalette.backgroundColor,
    color: vars['--color-fg'] ?? previewPalette.textColor,
    colorScheme: previewMode,
  } as CSSProperties

  const marketplace = branding.cardDisplayStyle === 'marketplace'
  const heroLayout = normalizeHeroLayout(branding.heroLayout ?? 'cinematic')
  const previewShowcase = useMemo(() => GENERIC_MTG_CARDS, [])
  const previewBackgrounds = resolvePageBackgrounds(branding.pageBackgrounds)
  const previewBackgroundPreset = resolveActiveBackgroundPreset(previewBackgrounds, previewMode === 'dark')
  const previewPatternColors = resolvePatternColorsForRender(previewBackgrounds, previewMode === 'dark')

  return (
    <div className="space-y-3">
      {showModeToggle ? (
        <div className="flex items-center justify-end">
          <ThemeModeSwitch mode={previewMode} onChange={setPreviewMode} label="Preview color mode" />
        </div>
      ) : null}
      <div
        style={themeStyle}
        className={cx(
          'relative min-h-[32rem] overflow-hidden rounded-card border border-border shadow-card',
          previewMode === 'dark' ? 'dark' : 'preview-light',
        )}
        data-page-background={previewBackgroundPreset}
      >
      <div className="pointer-events-none absolute inset-0 z-0 bg-bg" aria-hidden />
      <PageBackgroundLayer
        preset={previewBackgroundPreset}
        opacity={previewBackgrounds.opacity ?? 72}
        patternColors={previewPatternColors}
        className="absolute inset-0 z-0"
        preview
      />
      <div className="relative z-[1] space-y-4 p-5">
      <StoreHero
        name={storeName}
        tagline={branding.tagline}
        heroHeading={branding.heroHeading}
        heroSubheading={branding.heroSubheading}
        heroImageUrl={branding.heroImageUrl}
        logoUrl={branding.logoUrl}
        primaryColor={effectivePalette.primaryColor ?? branding.primaryColor}
        accentColor={effectivePalette.accentColor ?? branding.accentColor}
        layout={branding.heroLayout ?? 'cinematic'}
        communityEvents={heroLayout === 'event-board' ? PREVIEW_COMMUNITY_EVENTS : undefined}
        showcaseCards={previewShowcase}
        stats={{ listings: 706, cards: 2160, sets: 130 }}
        verified
      />

      <div className="flex flex-wrap items-center gap-2">
        <FilterPill active>Foil</FilterPill>
        <FilterPill>Rare</FilterPill>
        <FilterPill>Mythic</FilterPill>
        <Button size="sm" className="ml-auto">
          <Search aria-hidden className="size-4" />
          Search
        </Button>
      </div>

      <div className={marketplace ? 'grid gap-3' : 'grid grid-cols-2 gap-3 sm:grid-cols-3'}>
        {[1, 2, 3].map((n) =>
          marketplace ? (
            <div key={n} className={`flex gap-3 rounded-card bg-surface p-3 ${storeFrameClass('card')}`}>
              <div
                className="grid h-28 w-20 shrink-0 place-items-center self-center rounded-btn border-2 bg-bg text-fg-muted"
                style={{ borderColor: n === 1 ? '#f59e0b' : '#94a3b8' }}
              >
                <ImageOff aria-hidden className="size-5" />
              </div>
              <div className="flex min-w-0 flex-1 flex-col py-0.5">
                <p className="truncate text-lg font-semibold text-fg">Sample Card {n}</p>
                <p className="mt-0.5 text-sm text-fg-muted">Preview Set</p>
                <p className="mt-0.5 text-[13px] text-fg-muted">
                  {n === 1 ? 'Mythic' : 'Rare'} · #{n}42
                </p>
                <div className="mt-3 flex flex-1 flex-col">
                  <p className="text-xs text-fg-muted">3 listings</p>
                  <p className="mt-0.5 font-display text-[2.125rem] font-bold leading-none text-fg">
                    ${(n * 1.53).toFixed(2)}
                  </p>
                  <p className="mt-1.5 text-[13px] font-medium text-success-600">
                    Market ${(n * 1.86).toFixed(2)}
                  </p>
                  <p className="mt-0.5 text-xs text-fg-muted">NM / {n === 1 ? 'Foil' : 'Nonfoil'}</p>
                  <div className="mt-auto max-w-32 pt-3">
                  <Button size="sm" className="w-full">
                    <ShoppingCart aria-hidden className="size-3.5" />
                    Add to cart
                  </Button>
                </div>
                </div>
              </div>
            </div>
          ) : (
            <div key={n} className={`rounded-card bg-surface p-3 ${storeFrameClass('card')}`}>
              <div className="grid h-24 place-items-center rounded-btn bg-bg text-fg-muted">
                <ImageOff aria-hidden className="size-5" />
              </div>
              <p className="mt-2 truncate text-sm font-bold text-brand-600">Sample Card {n}</p>
              <div className="mt-1 flex items-center justify-between">
                <Badge tone={n === 1 ? 'brand' : 'neutral'}>{n === 1 ? 'Foil' : 'NM'}</Badge>
                <span className="text-sm font-bold text-fg">${(n * 1.53).toFixed(2)}</span>
              </div>
            </div>
          ),
        )}
      </div>

      <div className="flex items-center gap-3">
        <Button className="flex-1">
          {marketplace ? <ShoppingCart aria-hidden className="size-4" /> : <Heart aria-hidden className="size-4" />}
          {marketplace ? 'Add to cart' : 'Save favorite'}
        </Button>
        <Button variant="secondary" className="flex-1">
          Add to want list
        </Button>
      </div>
      </div>
    </div>
    {previewBackgroundPreset !== 'none' ? (
      <p className="text-xs text-fg-muted">
        Page background ({previewMode}): {PAGE_BACKGROUND_LABELS[previewBackgroundPreset]}
      </p>
    ) : null}
    </div>
  )
}

export default StorePreview
