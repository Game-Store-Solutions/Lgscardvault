import { useEffect, useRef, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { LayoutGrid, Palette, Rows3 } from 'lucide-react'
import { HeroLayoutPicker } from '../../components/store/hero/HeroLayoutPicker'
import { normalizeHeroLayout } from '../../components/store/hero/heroLayouts'
import api, { extractErrorMessage, httpStatus } from '../../api/client'
import type { ApiError, CardDisplayStyle, HeroLayout, Store } from '../../api/types'
import { useStore } from '../../hooks'
import { Button, Card, CardBody, CardHeader, Input, Textarea } from '../../components/ui'
import { StorePreview } from '../../components/store'
import { ImageUploadField } from '../../components/ImageUploadField'
import {
  ColorField,
  PALETTE_DEFAULTS as DEFAULTS,
  DARK_THEME_PRESET_CATEGORIES,
  mergeDarkThemePreset,
  mergeThemePreset,
  ThemePresetPicker,
  pickHeroBrandingPayload,
  sanitizeBrandingPayload,
  type ThemePreset,
} from '../../components/store/branding'

interface BrandingForm {
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
  heroLayout: HeroLayout
  hoursText: string
  contactEmail: string
  websiteUrl: string
  facebookUrl: string
  instagramUrl: string
  twitterUrl: string
  discordUrl: string
  darkColors: DarkColorsForm
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
}

function fromStore(store: Store): BrandingForm {
  return {
    primaryColor: store.primaryColor ?? '',
    accentColor: store.accentColor ?? '',
    backgroundColor: store.backgroundColor ?? '',
    surfaceColor: store.surfaceColor ?? '',
    textColor: store.textColor ?? '',
    mutedColor: store.mutedColor ?? '',
    borderColor: store.borderColor ?? '',
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
  }
}

export default function BrandingTab({ slug }: { slug: string }) {
  const queryClient = useQueryClient()
  const { data: store, isLoading } = useStore(slug)
  const [form, setForm] = useState<BrandingForm>(EMPTY)
  const [loadedSlug, setLoadedSlug] = useState<string | null>(null)
  const [formDirty, setFormDirty] = useState(false)
  const [previewMode, setPreviewMode] = useState<'light' | 'dark'>('light')
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

  const setDark = (key: keyof DarkColorsForm, value: string) => {
    setFormDirty(true)
    setForm((current) => ({ ...current, darkColors: { ...current.darkColors, [key]: value } }))
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
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(28rem,40rem)]">
      <div className="space-y-6">
        <Card>
          <CardHeader
            title="Brand colors"
            subtitle="Pick a curated theme, then fine-tune primary, accent, surfaces, and text."
          />
          <CardBody className="space-y-6">
            <div>
              <p className="mb-3 text-xs font-bold uppercase tracking-wide text-fg-muted">Store theme library</p>
              <ThemePresetPicker instanceId="light" onSelect={applyPreset} />
            </div>
            <div className="grid gap-5 border-t border-border pt-6 sm:grid-cols-2">
              <ColorField label="Primary / button color" value={form.primaryColor} fallback={DEFAULTS.primaryColor} onChange={(v) => set('primaryColor', v)} />
              <ColorField label="Accent color" value={form.accentColor} fallback={DEFAULTS.accentColor} onChange={(v) => set('accentColor', v)} />
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Surface & text" subtitle="Theme the page background, cards, text, and borders." />
          <CardBody className="grid gap-5 sm:grid-cols-2">
            <ColorField label="Page background" value={form.backgroundColor} fallback={DEFAULTS.backgroundColor} onChange={(v) => set('backgroundColor', v)} />
            <ColorField label="Card / surface" value={form.surfaceColor} fallback={DEFAULTS.surfaceColor} onChange={(v) => set('surfaceColor', v)} />
            <ColorField label="Text color" value={form.textColor} fallback={DEFAULTS.textColor} onChange={(v) => set('textColor', v)} />
            <ColorField label="Muted text" value={form.mutedColor} fallback={DEFAULTS.mutedColor} onChange={(v) => set('mutedColor', v)} />
            <ColorField label="Border color" value={form.borderColor} fallback={DEFAULTS.borderColor} onChange={(v) => set('borderColor', v)} />
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title="Hero banner"
            subtitle="Layout, images, and headline copy for your storefront header. Layout and uploads save automatically."
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

        <Card>
          <CardHeader
            title="Card display"
            subtitle="Choose how inventory cards appear on your public storefront."
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
              description="Current image-forward cards with the existing grid and list views."
              selected={form.cardDisplayStyle === 'gallery'}
              disabled={displayMutation.isPending}
              onClick={() => chooseCardDisplayStyle('gallery')}
            />
            <DisplayChoice
              icon={Rows3}
              title="Marketplace compact"
              description="Dense horizontal cards like the reference, with pricing and add-to-cart visible."
              selected={form.cardDisplayStyle === 'marketplace'}
              disabled={displayMutation.isPending}
              onClick={() => chooseCardDisplayStyle('marketplace')}
            />
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title="Dark mode palette"
            subtitle="Optional: shown when shoppers use the dark theme toggle. Pick a dark library theme or fine-tune below."
          />
          <CardBody className="space-y-6">
            <div>
              <p className="mb-3 text-xs font-bold uppercase tracking-wide text-fg-muted">Dark theme library</p>
              <ThemePresetPicker
                instanceId="dark"
                categories={DARK_THEME_PRESET_CATEGORIES}
                onSelect={applyDarkPreset}
              />
            </div>
            <div className="grid gap-5 border-t border-border pt-6 sm:grid-cols-2">
            <ColorField label="Primary / button color" value={form.darkColors.primaryColor} fallback={DEFAULTS.primaryColor} onChange={(v) => setDark('primaryColor', v)} />
            <ColorField label="Accent color" value={form.darkColors.accentColor} fallback={DEFAULTS.accentColor} onChange={(v) => setDark('accentColor', v)} />
            <ColorField label="Page background" value={form.darkColors.backgroundColor} fallback="#0f1220" onChange={(v) => setDark('backgroundColor', v)} />
            <ColorField label="Card / surface" value={form.darkColors.surfaceColor} fallback="#171b2e" onChange={(v) => setDark('surfaceColor', v)} />
            <ColorField label="Text color" value={form.darkColors.textColor} fallback="#f5f6fb" onChange={(v) => setDark('textColor', v)} />
            <ColorField label="Muted text" value={form.darkColors.mutedColor} fallback="#aab0cb" onChange={(v) => setDark('mutedColor', v)} />
            <ColorField label="Border color" value={form.darkColors.borderColor} fallback="#2a2f47" onChange={(v) => setDark('borderColor', v)} />
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title="Store info & footer"
            subtitle="Hours, contact, and social links shown in your storefront footer. Your business address from onboarding appears there automatically."
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
              <Input label="Website" placeholder="https://yourstore.com" value={form.websiteUrl} onChange={(e) => set('websiteUrl', e.target.value)} />
              <Input label="Facebook URL" placeholder="https://facebook.com/yourstore" value={form.facebookUrl} onChange={(e) => set('facebookUrl', e.target.value)} />
              <Input label="Instagram URL" placeholder="https://instagram.com/yourstore" value={form.instagramUrl} onChange={(e) => set('instagramUrl', e.target.value)} />
              <Input label="Twitter / X URL" placeholder="https://x.com/yourstore" value={form.twitterUrl} onChange={(e) => set('twitterUrl', e.target.value)} />
              <Input label="Discord invite URL" placeholder="https://discord.gg/yourstore" value={form.discordUrl} onChange={(e) => set('discordUrl', e.target.value)} />
            </div>
          </CardBody>
        </Card>

        <div className="flex items-center gap-4">
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

      {/* Live preview */}
      <div className="xl:sticky xl:top-8 xl:self-start">
        <p className="mb-3 text-xs font-bold uppercase tracking-wide text-fg-muted">Live store preview</p>
        <StorePreview
          branding={form}
          storeName={store?.name ?? slug}
          previewMode={previewMode}
          onPreviewModeChange={setPreviewMode}
        />
        <p className="mt-3 text-xs text-fg-muted">
          Toggle Light or Dark above the mockup to preview each palette. Dark uses your dark theme library and color fields.
        </p>
      </div>
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
