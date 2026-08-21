import { useEffect, useRef, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Image, LayoutGrid, Layers, Palette, Rows3, Square, Store as StoreIcon } from 'lucide-react'
import { HeroLayoutPicker } from '../../components/store/hero/HeroLayoutPicker'
import { normalizeHeroLayout } from '../../components/store/hero/heroLayouts'
import api, { extractErrorMessage, httpStatus } from '../../api/client'
import type { ApiError, CardDisplayStyle, HeroLayout, Store } from '../../api/types'
import { useStore } from '../../hooks'
import { Button, Card, CardBody, CardHeader, Input, TabPanel, Tabs, Textarea } from '../../components/ui'
import { StorePreview, ThemeModeSwitch } from '../../components/store'
import { ImageUploadField } from '../../components/ImageUploadField'
import {
  ColorField,
  RangeField,
  PALETTE_DEFAULTS as DEFAULTS,
  DARK_THEME_PRESET_CATEGORIES,
  mergeDarkThemePreset,
  mergeThemePreset,
  ThemePresetPicker,
  BrandingPreviewIsland,
  pickHeroBrandingPayload,
  sanitizeBrandingPayload,
  type ThemePreset,
} from '../../components/store/branding'
import {
  SURFACE_STYLE_DEFAULTS,
  SURFACE_STYLE_RANGES,
  inheritFrameStyles,
  resolveFrameStyles,
  storeFrameClass,
  storeThemeVars,
  type FrameKey,
  type FrameStyle,
  type FrameStyles,
} from '../../lib/storeTheme'
import { BackgroundPresetPicker } from '../../components/store/backgrounds'
import {
  PAGE_BACKGROUND_DEFAULTS,
  getSavedBackgroundColors,
  resolveActiveBackgroundPreset,
  resolvePageBackgrounds,
  type PageBackgroundPreset,
  type PageBackgroundThemeColors,
  type StorePageBackgrounds,
} from '../../lib/pageBackgrounds'

interface BrandingForm {
  primaryColor: string
  accentColor: string
  backgroundColor: string
  surfaceColor: string
  textColor: string
  mutedColor: string
  borderColor: string
  borderThickness: number
  surfaceBlur: number
  borderGlow: number
  frameStyles: FrameStyles
  darkFrameStyles: FrameStyles | null
  logoUrl: string
  heroImageUrl: string
  heroHeading: string
  heroSubheading: string
  tagline: string
  cardDisplayStyle: CardDisplayStyle
  heroLayout: HeroLayout
  hoursText: string
  contactEmail: string
  websiteUrl: string
  facebookUrl: string
  instagramUrl: string
  twitterUrl: string
  discordUrl: string
  darkColors: DarkColorsForm
  pageBackgrounds: StorePageBackgrounds
}

interface DarkColorsForm {
  primaryColor: string
  accentColor: string
  backgroundColor: string
  surfaceColor: string
  textColor: string
  mutedColor: string
  borderColor: string
}

const BRANDING_SECTIONS = [
  { id: 'colors', label: 'Colors', icon: Palette },
  { id: 'backgrounds', label: 'Backgrounds', icon: Layers },
  { id: 'borders', label: 'Borders', icon: Square },
  { id: 'hero', label: 'Hero', icon: Image },
  { id: 'cards', label: 'Cards', icon: LayoutGrid },
  { id: 'footer', label: 'Footer', icon: StoreIcon },
] as const

type BrandingSection = (typeof BRANDING_SECTIONS)[number]['id']

const EMPTY_DARK: DarkColorsForm = {
  primaryColor: '',
  accentColor: '',
  backgroundColor: '',
  surfaceColor: '',
  textColor: '',
  mutedColor: '',
  borderColor: '',
}

const EMPTY: BrandingForm = {
  primaryColor: '',
  accentColor: '',
  backgroundColor: '',
  surfaceColor: '',
  textColor: '',
  mutedColor: '',
  borderColor: '',
  borderThickness: SURFACE_STYLE_DEFAULTS.borderThickness,
  surfaceBlur: SURFACE_STYLE_DEFAULTS.surfaceBlur,
  borderGlow: SURFACE_STYLE_DEFAULTS.borderGlow,
  frameStyles: resolveFrameStyles(null),
  darkFrameStyles: null,
  logoUrl: '',
  heroImageUrl: '',
  heroHeading: '',
  heroSubheading: '',
  tagline: '',
  cardDisplayStyle: 'gallery',
  heroLayout: 'cinematic',
  hoursText: '',
  contactEmail: '',
  websiteUrl: '',
  facebookUrl: '',
  instagramUrl: '',
  twitterUrl: '',
  discordUrl: '',
  darkColors: EMPTY_DARK,
  pageBackgrounds: { ...PAGE_BACKGROUND_DEFAULTS },
}

function fromStore(store: Store): BrandingForm {
  const frameStyles = resolveFrameStyles(store.frameStyles, {
    borderThickness: store.borderThickness ?? SURFACE_STYLE_DEFAULTS.borderThickness,
    borderGlow: store.borderGlow ?? SURFACE_STYLE_DEFAULTS.borderGlow,
    surfaceBlur: store.surfaceBlur ?? SURFACE_STYLE_DEFAULTS.surfaceBlur,
  })
  return {
    primaryColor: store.primaryColor ?? '',
    accentColor: store.accentColor ?? '',
    backgroundColor: store.backgroundColor ?? '',
    surfaceColor: store.surfaceColor ?? '',
    textColor: store.textColor ?? '',
    mutedColor: store.mutedColor ?? '',
    borderColor: store.borderColor ?? '',
    borderThickness: store.borderThickness ?? SURFACE_STYLE_DEFAULTS.borderThickness,
    surfaceBlur: store.surfaceBlur ?? SURFACE_STYLE_DEFAULTS.surfaceBlur,
    borderGlow: store.borderGlow ?? SURFACE_STYLE_DEFAULTS.borderGlow,
    frameStyles,
    darkFrameStyles: store.darkFrameStyles
      ? inheritFrameStyles(store.darkFrameStyles, frameStyles)
      : null,
    logoUrl: store.logoUrl ?? '',
    heroImageUrl: store.heroImageUrl ?? '',
    heroHeading: store.heroHeading ?? '',
    heroSubheading: store.heroSubheading ?? '',
    tagline: store.tagline ?? '',
    cardDisplayStyle: store.cardDisplayStyle ?? 'gallery',
    heroLayout: store.heroLayout ?? 'cinematic',
    hoursText: store.hoursText ?? '',
    contactEmail: store.contactEmail ?? '',
    websiteUrl: store.websiteUrl ?? '',
    facebookUrl: store.facebookUrl ?? '',
    instagramUrl: store.instagramUrl ?? '',
    twitterUrl: store.twitterUrl ?? '',
    discordUrl: store.discordUrl ?? '',
    darkColors: { ...EMPTY_DARK, ...(store.darkColors ?? {}) },
    pageBackgrounds: resolvePageBackgrounds(store.pageBackgrounds),
  }
}

export default function BrandingTab({ slug }: { slug: string }) {
  const queryClient = useQueryClient()
  const { data: store, isLoading } = useStore(slug)
  const [form, setForm] = useState<BrandingForm>(EMPTY)
  const [loadedSlug, setLoadedSlug] = useState<string | null>(null)
  const [formDirty, setFormDirty] = useState(false)
  const [previewMode, setPreviewMode] = useState<'light' | 'dark'>('light')
  const [section, setSection] = useState<BrandingSection>('colors')
  const formRef = useRef(form)
  formRef.current = form

  useEffect(() => {
    if (isLoading || !store?.slug) return
    if (loadedSlug === store.slug) return
    setForm(fromStore(store))
    setLoadedSlug(store.slug)
    setFormDirty(false)
  }, [isLoading, loadedSlug, store])

  const set = <K extends keyof BrandingForm>(key: K, value: BrandingForm[K]) => {
    setFormDirty(true)
    setForm((current) => ({ ...current, [key]: value }))
  }

  const setFrame = (key: FrameKey, patch: Partial<FrameStyle>) => {
    setFormDirty(true)
    setForm((current) => {
      const frameStyles = {
        ...current.frameStyles,
        [key]: { ...current.frameStyles[key], ...patch },
      }
      return {
        ...current,
        frameStyles,
        borderThickness: frameStyles.hero.borderThickness,
        borderGlow: frameStyles.hero.borderGlow,
        surfaceBlur: frameStyles.hero.surfaceBlur,
      }
    })
  }

  const setDarkFrame = (key: FrameKey, patch: Partial<FrameStyle>) => {
    setFormDirty(true)
    setForm((current) => {
      const base = inheritFrameStyles(current.darkFrameStyles, current.frameStyles)
      return {
        ...current,
        darkFrameStyles: {
          ...base,
          [key]: { ...base[key], ...patch },
        },
      }
    })
  }

  const setDark = (key: keyof DarkColorsForm, value: string) => {
    setFormDirty(true)
    setForm((current) => ({ ...current, darkColors: { ...current.darkColors, [key]: value } }))
  }

  const resolvedBackgrounds = resolvePageBackgrounds(form.pageBackgrounds)
  const activeBackgroundPreset = resolveActiveBackgroundPreset(resolvedBackgrounds, previewMode === 'dark')

  const setBackgroundPreset = (preset: PageBackgroundPreset) => {
    setFormDirty(true)
    setForm((current) => {
      const pageBackgrounds = resolvePageBackgrounds(current.pageBackgrounds)
      if (previewMode === 'light') {
        pageBackgrounds.light = preset
      } else {
        pageBackgrounds.dark = preset
      }
      return { ...current, pageBackgrounds }
    })
  }

  const setBackgroundOpacity = (opacity: number) => {
    setFormDirty(true)
    setForm((current) => ({
      ...current,
      pageBackgrounds: { ...resolvePageBackgrounds(current.pageBackgrounds), opacity },
    }))
  }

  const lightBackgroundColors = getSavedBackgroundColors(form.pageBackgrounds, 'light')
  const darkBackgroundColors = getSavedBackgroundColors(form.pageBackgrounds, 'dark')

  const setBackgroundPatternColor = (
    theme: 'light' | 'dark',
    key: keyof PageBackgroundThemeColors,
    value: string,
  ) => {
    setFormDirty(true)
    setForm((current) => {
      const pageBackgrounds = { ...resolvePageBackgrounds(current.pageBackgrounds) }
      const colors = { ...(pageBackgrounds.colors ?? {}) }
      const themeColors = { ...(colors[theme] ?? {}) }
      const trimmed = value.trim()
      if (trimmed) themeColors[key] = trimmed
      else delete themeColors[key]
      if (Object.keys(themeColors).length > 0) colors[theme] = themeColors
      else delete colors[theme]
      pageBackgrounds.colors = Object.keys(colors).length > 0 ? colors : undefined
      return { ...current, pageBackgrounds }
    })
  }

  const applyPreset = (preset: ThemePreset) => {
    setFormDirty(true)
    setForm((current) => mergeThemePreset(current, preset, EMPTY_DARK))
    if (preset.darkPalette) setPreviewMode('dark')
    else setPreviewMode('light')
  }

  const applyDarkPreset = (preset: ThemePreset) => {
    setFormDirty(true)
    setForm((current) => mergeDarkThemePreset(current, preset, EMPTY_DARK))
    setPreviewMode('dark')
  }

  const mergeSavedStore = (saved: Store) => {
    queryClient.setQueryData<Store>(['store', slug], (current) => ({ ...(current ?? {}), ...saved } as Store))
    const merged = { ...(queryClient.getQueryData<Store>(['store', slug]) ?? {}), ...saved } as Store
    setForm(fromStore(merged))
  }

  const mutation = useMutation({
    mutationFn: async () => {
      const payload = sanitizeBrandingPayload({ ...form })
      const { data } = await api.patch<Store>(`/stores/${slug}/settings`, payload)
      return data
    },
    onSuccess: async (saved) => {
      mergeSavedStore(saved)
      setFormDirty(false)
      await queryClient.invalidateQueries({ queryKey: ['store', slug] })
    },
  })

  const heroBrandingMutation = useMutation({
    mutationFn: async (payload: ReturnType<typeof pickHeroBrandingPayload>) => {
      const { data } = await api.patch<Store>(`/stores/${slug}/settings`, payload)
      return data
    },
    onSuccess: async (saved) => {
      mergeSavedStore(saved)
      setFormDirty(false)
      await queryClient.invalidateQueries({ queryKey: ['store', slug] })
    },
  })

  function saveHeroBranding(overrides?: Partial<BrandingForm>) {
    const snapshot = { ...formRef.current, ...overrides }
    heroBrandingMutation.mutate(pickHeroBrandingPayload(snapshot))
  }

  function onHeroImageChange(value: string) {
    set('heroImageUrl', value)
  }

  function onLogoChange(value: string) {
    set('logoUrl', value)
  }

  const displayMutation = useMutation({
    mutationFn: async (cardDisplayStyle: CardDisplayStyle) => {
      const { data } = await api.patch<Store>(`/stores/${slug}/settings`, { cardDisplayStyle })
      return data
    },
    onMutate: async (cardDisplayStyle) => {
      await queryClient.cancelQueries({ queryKey: ['store', slug] })
      const previous = queryClient.getQueryData<Store>(['store', slug])
      queryClient.setQueryData<Store>(['store', slug], (current) =>
        current ? { ...current, cardDisplayStyle } : current,
      )
      return { previous }
    },
    onError: (_error, _cardDisplayStyle, context) => {
      if (context?.previous) {
        queryClient.setQueryData(['store', slug], context.previous)
        set('cardDisplayStyle', context.previous.cardDisplayStyle ?? 'gallery')
      }
    },
    onSuccess: (saved, cardDisplayStyle) => {
      queryClient.setQueryData<Store>(['store', slug], (current) => ({
        ...current,
        ...saved,
        cardDisplayStyle,
      }))
    },
  })

  function chooseCardDisplayStyle(cardDisplayStyle: CardDisplayStyle) {
    set('cardDisplayStyle', cardDisplayStyle)
    displayMutation.mutate(cardDisplayStyle)
  }

  const heroLayoutMutation = useMutation({
    mutationFn: async (heroLayout: HeroLayout) => {
      const { data } = await api.patch<Store>(`/stores/${slug}/settings`, { heroLayout })
      return data
    },
    onMutate: async (heroLayout) => {
      await queryClient.cancelQueries({ queryKey: ['store', slug] })
      const previous = queryClient.getQueryData<Store>(['store', slug])
      queryClient.setQueryData<Store>(['store', slug], (current) =>
        current ? { ...current, heroLayout } : current,
      )
      return { previous }
    },
    onError: (_error, _heroLayout, context) => {
      if (context?.previous) {
        queryClient.setQueryData(['store', slug], context.previous)
        set('heroLayout', context.previous.heroLayout ?? 'cinematic')
      }
    },
    onSuccess: async (saved, heroLayout) => {
      queryClient.setQueryData<Store>(['store', slug], (current) => ({
        ...(current ?? {}),
        ...saved,
        heroLayout,
      } as Store))
      setFormDirty(false)
      await queryClient.invalidateQueries({ queryKey: ['store', slug] })
    },
  })

  function chooseHeroLayout(heroLayout: HeroLayout) {
    setForm((current) => ({ ...current, heroLayout }))
    heroLayoutMutation.mutate(heroLayout)
  }

  return (
    <div className="grid min-w-0 gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(28rem,40rem)]">
      <div className="min-w-0 space-y-6">
        <Tabs
          aria-label="Branding sections"
          value={section}
          onChange={(id) => setSection(id as BrandingSection)}
          tabs={[...BRANDING_SECTIONS]}
        />

        <TabPanel when="colors" value={section} className="space-y-6 pt-5">
          <Card>
            <CardHeader
              title={previewMode === 'dark' ? 'Dark theme library' : 'Theme library'}
              subtitle={
                previewMode === 'dark'
                  ? 'Used when shoppers switch to dark mode. Pick a preset, then fine-tune below.'
                  : 'Start with a curated palette, then tune buttons and page colors.'
              }
              actions={
                <ThemeModeSwitch
                  mode={previewMode}
                  onChange={setPreviewMode}
                  label="Color mode"
                />
              }
            />
            <CardBody>
              {previewMode === 'dark' ? (
                <ThemePresetPicker
                  instanceId="dark"
                  categories={DARK_THEME_PRESET_CATEGORIES}
                  onSelect={applyDarkPreset}
                />
              ) : (
                <ThemePresetPicker instanceId="light" onSelect={applyPreset} />
              )}
            </CardBody>
          </Card>
          {previewMode === 'light' ? (
            <>
              <Card>
                <CardHeader title="Brand colors" subtitle="Buttons, links, and accents shoppers see first." />
                <CardBody className="space-y-5">
                  <BrandingPreviewIsland
                    mode="light"
                    themeVars={{
                      '--color-brand-500': form.primaryColor || DEFAULTS.primaryColor,
                      '--color-accent-500': form.accentColor || DEFAULTS.accentColor,
                    }}
                    className="flex flex-wrap gap-2 p-4"
                  >
                    {[form.primaryColor || DEFAULTS.primaryColor, form.accentColor || DEFAULTS.accentColor].map((color) => (
                      <span
                        key={color}
                        className="h-10 min-w-[4.5rem] flex-1 rounded-btn border border-border"
                        style={{ backgroundColor: color }}
                        aria-hidden
                      />
                    ))}
                  </BrandingPreviewIsland>
                  <div className="grid gap-5 sm:grid-cols-2">
                    <ColorField label="Primary / buttons" value={form.primaryColor} fallback={DEFAULTS.primaryColor} onChange={(v) => set('primaryColor', v)} />
                    <ColorField label="Accent" value={form.accentColor} fallback={DEFAULTS.accentColor} onChange={(v) => set('accentColor', v)} />
                  </div>
                </CardBody>
              </Card>
              <Card>
                <CardHeader title="Page & text" subtitle="Background, cards, and readable type — not borders." />
                <CardBody className="space-y-5">
                  <BrandingPreviewIsland
                    mode="light"
                    themeVars={{
                      '--color-bg': form.backgroundColor || DEFAULTS.backgroundColor,
                      '--color-surface': form.surfaceColor || DEFAULTS.surfaceColor,
                      '--color-fg': form.textColor || DEFAULTS.textColor,
                      '--color-fg-muted': form.mutedColor || DEFAULTS.mutedColor,
                    }}
                    className="space-y-2 p-4"
                  >
                    <div className="grid grid-cols-2 gap-2">
                      <div className="h-12 rounded-btn border border-border bg-bg" />
                      <div className="h-12 rounded-btn border border-border bg-surface" />
                    </div>
                    <p className="text-[11px] text-fg-muted">Page background · Card surface</p>
                  </BrandingPreviewIsland>
                  <div className="grid gap-5 sm:grid-cols-2">
                    <ColorField label="Page background" value={form.backgroundColor} fallback={DEFAULTS.backgroundColor} onChange={(v) => set('backgroundColor', v)} />
                    <ColorField label="Card / surface" value={form.surfaceColor} fallback={DEFAULTS.surfaceColor} onChange={(v) => set('surfaceColor', v)} />
                    <ColorField label="Text color" value={form.textColor} fallback={DEFAULTS.textColor} onChange={(v) => set('textColor', v)} />
                    <ColorField label="Muted text" value={form.mutedColor} fallback={DEFAULTS.mutedColor} onChange={(v) => set('mutedColor', v)} />
                  </div>
                </CardBody>
              </Card>
            </>
          ) : (
            <Card>
              <CardHeader title="Dark colors" subtitle="Leave a field blank to inherit from the light theme." />
              <CardBody className="space-y-5">
                <BrandingPreviewIsland
                  mode="dark"
                  themeVars={{
                    '--color-bg': form.darkColors.backgroundColor || '#0f1220',
                    '--color-surface': form.darkColors.surfaceColor || '#171b2e',
                    '--color-brand-500': form.darkColors.primaryColor || form.primaryColor || DEFAULTS.primaryColor,
                    '--color-accent-500': form.darkColors.accentColor || form.accentColor || DEFAULTS.accentColor,
                    '--color-fg': form.darkColors.textColor || '#f5f6fb',
                    '--color-fg-muted': form.darkColors.mutedColor || '#aab0cb',
                  }}
                  className="grid grid-cols-2 gap-2 p-4 sm:grid-cols-4"
                >
                  {[
                    form.darkColors.backgroundColor || '#0f1220',
                    form.darkColors.surfaceColor || '#171b2e',
                    form.darkColors.primaryColor || form.primaryColor || DEFAULTS.primaryColor,
                    form.darkColors.accentColor || form.accentColor || DEFAULTS.accentColor,
                  ].map((color) => (
                    <span
                      key={color}
                      className="h-10 rounded-btn border border-border"
                      style={{ backgroundColor: color }}
                      aria-hidden
                    />
                  ))}
                </BrandingPreviewIsland>
                <div className="grid gap-5 sm:grid-cols-2">
                <ColorField label="Primary / buttons" value={form.darkColors.primaryColor} fallback={DEFAULTS.primaryColor} onChange={(v) => setDark('primaryColor', v)} />
                <ColorField label="Accent" value={form.darkColors.accentColor} fallback={DEFAULTS.accentColor} onChange={(v) => setDark('accentColor', v)} />
                <ColorField label="Page background" value={form.darkColors.backgroundColor} fallback="#0f1220" onChange={(v) => setDark('backgroundColor', v)} />
                <ColorField label="Card / surface" value={form.darkColors.surfaceColor} fallback="#171b2e" onChange={(v) => setDark('surfaceColor', v)} />
                <ColorField label="Text color" value={form.darkColors.textColor} fallback="#f5f6fb" onChange={(v) => setDark('textColor', v)} />
                <ColorField label="Muted text" value={form.darkColors.mutedColor} fallback="#aab0cb" onChange={(v) => setDark('mutedColor', v)} />
                <ColorField label="Border color" value={form.darkColors.borderColor} fallback="#2a2f47" onChange={(v) => setDark('borderColor', v)} />
                </div>
              </CardBody>
            </Card>
          )}
        </TabPanel>

        <TabPanel when="backgrounds" value={section} className="space-y-6 pt-5">
          <Card>
            <CardHeader
              title="Page backgrounds"
              subtitle={
                previewMode === 'dark'
                  ? 'Pattern behind your storefront in dark mode. Animated presets drift as shoppers scroll.'
                  : 'Decorative layer on your page color. Waves, aurora, and grids follow scroll on the live store.'
              }
              actions={
                <ThemeModeSwitch
                  mode={previewMode}
                  onChange={setPreviewMode}
                  label="Background mode"
                />
              }
            />
            <CardBody className="space-y-6">
              {previewMode === 'light' ? (
                <BackgroundPatternColorGroup
                  title="Light pattern colors"
                  hint="Tints for waves, aurora, and grid accents in light mode."
                  colors={lightBackgroundColors}
                  fallbacks={{
                    primary: form.primaryColor || DEFAULTS.primaryColor,
                    secondary: form.accentColor || DEFAULTS.accentColor,
                    base: form.backgroundColor || DEFAULTS.backgroundColor,
                  }}
                  onChange={(key, value) => setBackgroundPatternColor('light', key, value)}
                  mode="light"
                />
              ) : (
                <BackgroundPatternColorGroup
                  title="Dark pattern colors"
                  hint="Separate tints for dark mode. Leave blank to inherit light pattern colors on the storefront."
                  colors={darkBackgroundColors}
                  fallbacks={{
                    primary: form.darkColors.primaryColor || form.primaryColor || DEFAULTS.primaryColor,
                    secondary: form.darkColors.accentColor || form.accentColor || DEFAULTS.accentColor,
                    base: form.darkColors.backgroundColor || form.backgroundColor || DEFAULTS.backgroundColor,
                  }}
                  onChange={(key, value) => setBackgroundPatternColor('dark', key, value)}
                  mode="dark"
                />
              )}
              <RangeField
                label="Pattern strength"
                value={resolvedBackgrounds.opacity ?? PAGE_BACKGROUND_DEFAULTS.opacity ?? 72}
                min={0}
                max={100}
                unit="%"
                hint="Higher values make the pattern more visible."
                onChange={setBackgroundOpacity}
              />
              <BackgroundPresetPicker
                mode={previewMode}
                value={activeBackgroundPreset}
                onChange={setBackgroundPreset}
                settings={form.pageBackgrounds}
              />
            </CardBody>
          </Card>
        </TabPanel>

        <TabPanel when="borders" value={section} className="space-y-6 pt-5">
          <Card>
            <CardHeader
              title="Storefront frames"
              subtitle={
                previewMode === 'dark'
                  ? 'Dark theme borders. Leave untouched to inherit the light settings.'
                  : 'Light theme borders. Switch to Dark to set a separate look.'
              }
              actions={
                <ThemeModeSwitch
                  mode={previewMode}
                  onChange={setPreviewMode}
                  label="Border color mode"
                />
              }
            />
            <CardBody className="space-y-6">
              {previewMode === 'dark' ? (
                <ColorField
                  label="Dark border color"
                  value={form.darkColors.borderColor}
                  fallback="#2a2f47"
                  onChange={(v) => setDark('borderColor', v)}
                />
              ) : (
                <ColorField
                  label="Light border color"
                  value={form.borderColor}
                  fallback={DEFAULTS.borderColor.startsWith('#') ? DEFAULTS.borderColor : '#e7e9ee'}
                  onChange={(v) => set('borderColor', v)}
                />
              )}
              <FrameEditors
                mode={previewMode}
                frames={
                  previewMode === 'dark'
                    ? inheritFrameStyles(form.darkFrameStyles, form.frameStyles)
                    : form.frameStyles
                }
                themeVars={storeThemeVars(
                  previewMode === 'dark'
                    ? {
                        ...form.darkColors,
                        backgroundColor: form.darkColors.backgroundColor || '#0f1220',
                        surfaceColor: form.darkColors.surfaceColor || '#171b2e',
                        textColor: form.darkColors.textColor || '#f5f6fb',
                        mutedColor: form.darkColors.mutedColor || '#aab0cb',
                        borderColor: form.darkColors.borderColor || '#2a2f47',
                        frameStyles: inheritFrameStyles(form.darkFrameStyles, form.frameStyles),
                      }
                    : form,
                  previewMode === 'dark',
                )}
                onChange={previewMode === 'dark' ? setDarkFrame : setFrame}
              />
            </CardBody>
          </Card>
        </TabPanel>

        <TabPanel when="hero" value={section} className="pt-5">
          <Card>
            <CardHeader
              title="Hero banner"
              subtitle="Layout, images, and headline copy. Layout and uploads save automatically."
              actions={
                <DisplaySaveStatus
                  saving={heroLayoutMutation.isPending || heroBrandingMutation.isPending}
                  saved={heroLayoutMutation.isSuccess || heroBrandingMutation.isSuccess}
                  error={heroLayoutMutation.isError || heroBrandingMutation.isError}
                />
              }
            />
            <CardBody className="space-y-8">
              <div>
                <p className="mb-3 text-xs font-bold uppercase tracking-wide text-fg-muted">Banner layout</p>
                <HeroLayoutPicker
                  selectedLayout={normalizeHeroLayout(form.heroLayout)}
                  disabled={heroLayoutMutation.isPending}
                  onSelect={chooseHeroLayout}
                />
              </div>
              <div className="space-y-4 border-t border-border pt-6">
                <p className="text-xs font-bold uppercase tracking-wide text-fg-muted">Logo & hero image</p>
                <ImageUploadField
                  label="Logo / icon"
                  placeholder="https://…/logo.png"
                  value={form.logoUrl}
                  onChange={onLogoChange}
                  onUploadComplete={(url) => saveHeroBranding({ logoUrl: url })}
                  hint="Upload an image or paste a URL. Also used by the loading screen."
                />
                <ImageUploadField
                  label="Hero banner image"
                  placeholder="https://…/banner.jpg"
                  value={form.heroImageUrl}
                  onChange={onHeroImageChange}
                  onUploadComplete={(url) => saveHeroBranding({ heroImageUrl: url })}
                  hint="Background on most layouts (not cinematic classic). Upload shop photos or art."
                />
              </div>
              <div className="space-y-4 border-t border-border pt-6">
                <p className="text-xs font-bold uppercase tracking-wide text-fg-muted">Messaging</p>
                <Input label="Tagline" placeholder="Your local Magic singles shop" maxLength={160} value={form.tagline} onChange={(e) => set('tagline', e.target.value)} />
                <Input label="Hero heading" placeholder="Defaults to your store name" maxLength={160} value={form.heroHeading} onChange={(e) => set('heroHeading', e.target.value)} />
                <Textarea label="Hero subheading" rows={3} placeholder="A sentence or two about your store, shipping, or specialties." value={form.heroSubheading} onChange={(e) => set('heroSubheading', e.target.value)} />
                <div className="flex flex-wrap items-center gap-3">
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => saveHeroBranding()}
                    loading={heroBrandingMutation.isPending}
                    disabled={isLoading}
                  >
                    Save hero copy
                  </Button>
                  {heroBrandingMutation.isError ? (
                    <span role="alert" className="text-sm font-medium text-danger-700">
                      {extractErrorMessage(heroBrandingMutation.error, 'Could not save hero banner.')}
                    </span>
                  ) : null}
                </div>
              </div>
            </CardBody>
          </Card>
        </TabPanel>

        <TabPanel when="cards" value={section} className="pt-5">
          <Card>
            <CardHeader
              title="Inventory cards"
              subtitle="How singles appear on your public storefront."
              actions={
                <DisplaySaveStatus
                  saving={displayMutation.isPending}
                  saved={displayMutation.isSuccess}
                  error={displayMutation.isError}
                />
              }
            />
            <CardBody className="grid gap-3 md:grid-cols-2">
              <DisplayChoice
                icon={LayoutGrid}
                title="Gallery"
                description="Image-forward cards with grid and list views."
                selected={form.cardDisplayStyle === 'gallery'}
                disabled={displayMutation.isPending}
                onClick={() => chooseCardDisplayStyle('gallery')}
              />
              <DisplayChoice
                icon={Rows3}
                title="Marketplace compact"
                description="Dense horizontal cards with pricing and add-to-cart visible."
                selected={form.cardDisplayStyle === 'marketplace'}
                disabled={displayMutation.isPending}
                onClick={() => chooseCardDisplayStyle('marketplace')}
              />
            </CardBody>
          </Card>
        </TabPanel>

        <TabPanel when="footer" value={section} className="pt-5">
          <Card>
            <CardHeader
              title="Store info & footer"
              subtitle="Hours, contact, and social links. Your onboarding address appears automatically."
            />
            <CardBody className="space-y-4">
              <Textarea
                label="Store hours"
                rows={3}
                placeholder={'Mon–Fri 12–9pm\nSat 10am–10pm\nSun 11am–6pm'}
                value={form.hoursText}
                onChange={(e) => set('hoursText', e.target.value)}
              />
              <div className="grid gap-4 sm:grid-cols-2">
                <Input label="Contact email" type="email" placeholder="hello@yourstore.com" value={form.contactEmail} onChange={(e) => set('contactEmail', e.target.value)} />
                <Input label="Website" placeholder="https://yourstore.com" value={form.websiteUrl} onChange={(e) => set('websiteUrl', e.target.value)} />
                <Input label="Facebook URL" placeholder="https://facebook.com/yourstore" value={form.facebookUrl} onChange={(e) => set('facebookUrl', e.target.value)} />
                <Input label="Instagram URL" placeholder="https://instagram.com/yourstore" value={form.instagramUrl} onChange={(e) => set('instagramUrl', e.target.value)} />
                <Input label="Twitter / X URL" placeholder="https://x.com/yourstore" value={form.twitterUrl} onChange={(e) => set('twitterUrl', e.target.value)} />
                <Input label="Discord invite URL" placeholder="https://discord.gg/yourstore" value={form.discordUrl} onChange={(e) => set('discordUrl', e.target.value)} />
              </div>
            </CardBody>
          </Card>
        </TabPanel>

        <div className="sticky bottom-4 z-10 flex flex-wrap items-center gap-4 rounded-card border border-border bg-surface/95 px-4 py-3 shadow-card backdrop-blur-md">
          <Button onClick={() => mutation.mutate()} loading={mutation.isPending} disabled={isLoading}>
            <Palette aria-hidden className="size-4" />
            Save branding
          </Button>
          {mutation.isSuccess && (
            <span role="status" className="text-sm font-medium text-success-700">
              Branding saved.
            </span>
          )}
          {mutation.isError && (
            <span role="alert" className="text-sm font-medium text-danger-700">
              {readError(mutation.error)}
            </span>
          )}
          {formDirty && !mutation.isPending && !mutation.isSuccess && (
            <span className="text-sm text-fg-muted">Unsaved changes</span>
          )}
        </div>
      </div>

      <div className="min-w-0 xl:sticky xl:top-8 xl:self-start">
        <p className="mb-3 text-xs font-bold uppercase tracking-wide text-fg-muted">Live store preview</p>
        <div className="max-w-full overflow-hidden">
          <StorePreview
          branding={form}
          storeName={store?.name ?? slug}
          previewMode={previewMode}
          onPreviewModeChange={setPreviewMode}
        />
        </div>
        <p className="mt-3 text-xs text-fg-muted">
          The Light/Dark switch updates the live preview only. Admin panels stay on your workspace theme.
        </p>
      </div>
    </div>
  )
}

function BackgroundPatternColorGroup({
  title,
  hint,
  colors,
  fallbacks,
  onChange,
  mode,
}: {
  title: string
  hint: string
  colors: PageBackgroundThemeColors
  fallbacks: { primary: string; secondary: string; base: string }
  onChange: (key: keyof PageBackgroundThemeColors, value: string) => void
  mode: 'light' | 'dark'
}) {
  const previewVars = {
    '--page-bg-pattern-primary': colors.primary || fallbacks.primary,
    '--page-bg-pattern-secondary': colors.secondary || fallbacks.secondary,
    '--page-bg-pattern-base': colors.base || fallbacks.base,
  } as Record<string, string>

  return (
    <div className="space-y-4 rounded-card border border-border bg-surface/60 p-4">
      <div>
        <p className="text-xs font-bold uppercase tracking-wide text-fg-muted">{title}</p>
        <p className="mt-1 text-xs text-fg-muted">{hint}</p>
      </div>
      <BrandingPreviewIsland mode={mode} themeVars={previewVars} className="p-4">
        <div className="grid h-16 grid-cols-3 gap-2">
          <div
            className="rounded-btn border border-border"
            style={{ background: `color-mix(in srgb, ${previewVars['--page-bg-pattern-primary']} 55%, transparent)` }}
            aria-hidden
          />
          <div
            className="rounded-btn border border-border"
            style={{ background: `color-mix(in srgb, ${previewVars['--page-bg-pattern-secondary']} 55%, transparent)` }}
            aria-hidden
          />
          <div
            className="rounded-btn border border-border"
            style={{ background: previewVars['--page-bg-pattern-base'] }}
            aria-hidden
          />
        </div>
        <p className="mt-2 text-[11px] text-fg-muted">Primary · Secondary · Base wash</p>
      </BrandingPreviewIsland>
      <div className="grid gap-4 border-t border-border pt-4">
        <ColorField
          label="Primary tint"
          value={colors.primary ?? ''}
          fallback={fallbacks.primary}
          onChange={(v) => onChange('primary', v)}
        />
        <ColorField
          label="Secondary tint"
          value={colors.secondary ?? ''}
          fallback={fallbacks.secondary}
          onChange={(v) => onChange('secondary', v)}
        />
        <ColorField
          label="Base wash"
          value={colors.base ?? ''}
          fallback={fallbacks.base}
          onChange={(v) => onChange('base', v)}
        />
      </div>
    </div>
  )
}

function FrameEditors({
  frames,
  themeVars,
  mode,
  onChange,
}: {
  frames: FrameStyles
  themeVars: Record<string, string>
  mode: 'light' | 'dark'
  onChange: (key: FrameKey, patch: Partial<FrameStyle>) => void
}) {
  const pieces: { key: FrameKey; title: string; hint: string }[] = [
    { key: 'hero', title: 'Hero box', hint: 'Banner identity panel' },
    { key: 'tile', title: 'Shortcut tile', hint: 'Search, events, sell/trade' },
    { key: 'card', title: 'Inventory card', hint: 'Singles grid and sidebar' },
  ]

  return (
    <div className="grid gap-4 sm:grid-cols-3">
      {pieces.map((piece) => {
        const style = frames[piece.key]
        return (
          <div
            key={piece.key}
            className="space-y-3 rounded-card border border-border bg-surface/60 p-3"
          >
            <p className="text-[11px] font-bold uppercase tracking-wide text-fg-muted">Preview</p>
            <BrandingPreviewIsland mode={mode} themeVars={themeVars} className="min-h-[6.5rem] p-3">
              {piece.key === 'hero' ? (
                <div className={`rounded-card bg-surface p-3 ${storeFrameClass('hero')}`}>
                  <p className="text-xs font-bold text-fg">{piece.title}</p>
                  <p className="mt-1 text-[11px] text-fg-muted">{piece.hint}</p>
                </div>
              ) : piece.key === 'tile' ? (
                <div className={`flex flex-col items-center justify-center gap-2 rounded-card bg-surface px-2 py-4 ${storeFrameClass('tile')}`}>
                  <span className="grid size-8 place-items-center rounded-xl bg-brand-500/12 text-brand-600">
                    <Square aria-hidden className="size-4" />
                  </span>
                  <span className="text-center text-[11px] font-bold text-fg">{piece.title}</span>
                </div>
              ) : (
                <div className={`rounded-card bg-surface p-2 ${storeFrameClass('card')}`}>
                  <div className="mb-2 h-16 rounded-btn bg-bg" />
                  <p className="truncate text-xs font-bold text-fg">{piece.title}</p>
                  <p className="text-[11px] text-fg-muted">$1.53</p>
                </div>
              )}
            </BrandingPreviewIsland>
            <div className="space-y-3 border-t border-border pt-3">
              <RangeField
                label="Thickness"
                value={style.borderThickness}
                min={SURFACE_STYLE_RANGES.borderThickness.min}
                max={SURFACE_STYLE_RANGES.borderThickness.max}
                onChange={(v) => onChange(piece.key, { borderThickness: v })}
              />
              <RangeField
                label="Glow"
                value={style.borderGlow}
                min={SURFACE_STYLE_RANGES.borderGlow.min}
                max={SURFACE_STYLE_RANGES.borderGlow.max}
                onChange={(v) => onChange(piece.key, { borderGlow: v })}
              />
              <RangeField
                label="Blur"
                value={style.surfaceBlur}
                min={SURFACE_STYLE_RANGES.surfaceBlur.min}
                max={SURFACE_STYLE_RANGES.surfaceBlur.max}
                onChange={(v) => onChange(piece.key, { surfaceBlur: v })}
              />
            </div>
          </div>
        )
      })}
    </div>
  )
}

function DisplayChoice({
  icon: Icon,
  title,
  description,
  selected,
  disabled = false,
  onClick,
}: {
  icon: import('lucide-react').LucideIcon
  title: string
  description: string
  selected: boolean
  disabled?: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      disabled={disabled}
      className={`flex gap-3 rounded-card border p-4 text-left transition-colors ${
        selected ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-border bg-surface text-fg hover:border-brand-500'
      } disabled:cursor-not-allowed disabled:opacity-70`}
    >
      <span className="grid size-10 shrink-0 place-items-center rounded-btn bg-surface text-brand-600">
        <Icon aria-hidden className="size-5" />
      </span>
      <span>
        <span className="block font-display text-base font-bold">{title}</span>
        <span className={`mt-1 block text-sm ${selected ? 'text-brand-700' : 'text-fg-muted'}`}>{description}</span>
      </span>
    </button>
  )
}

function DisplaySaveStatus({
  saving,
  saved,
  error,
}: {
  saving: boolean
  saved: boolean
  error: boolean
}) {
  if (saving) return <span className="text-xs font-bold text-fg-muted">Saving...</span>
  if (error) return <span className="text-xs font-bold text-danger-700">Not saved</span>
  if (saved) return <span className="text-xs font-bold text-success-700">Saved</span>
  return null
}

function readError(error: unknown): string {
  if (httpStatus(error) === 422) {
    const detail = (error as ApiError | null)?.response?.data
    if (detail && typeof detail === 'object' && 'detail' in detail) {
      return String((detail as { detail: unknown }).detail)
    }
    return 'Please check your colors and image URLs.'
  }
  return 'Could not save branding. Please try again.'
}
