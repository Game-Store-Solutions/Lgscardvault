import { useEffect, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { LayoutGrid, Palette, Rows3, type LucideIcon } from 'lucide-react'
import api, { httpStatus } from '../../api/client'
import type { ApiError, CardDisplayStyle, Store } from '../../api/types'
import { useStore } from '../../hooks'
import { Button, Card, CardBody, CardHeader, Input, Textarea } from '../../components/ui'
import { StorePreview } from '../../components/store'
import { ImageUploadField } from '../../components/ImageUploadField'
import {
  ColorField,
  PALETTE_DEFAULTS as DEFAULTS,
  THEME_PRESETS,
  ThemePresetButton,
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

  useEffect(() => {
    if (store && store.slug !== loadedSlug) {
      setForm(fromStore(store))
      setLoadedSlug(store.slug)
    }
  }, [loadedSlug, store])

  const set = <K extends keyof BrandingForm>(key: K, value: BrandingForm[K]) =>
    setForm((current) => ({ ...current, [key]: value }))

  const setDark = (key: keyof DarkColorsForm, value: string) =>
    setForm((current) => ({ ...current, darkColors: { ...current.darkColors, [key]: value } }))

  const applyPreset = (preset: ThemePreset) => setForm((current) => ({ ...current, ...preset.palette }))

  const mutation = useMutation({
    mutationFn: async () => {
      const { data } = await api.patch<Store>(`/stores/${slug}/settings`, form)
      return data
    },
    onSuccess: async (saved) => {
      queryClient.setQueryData<Store>(['store', slug], (current) => ({ ...current, ...saved }))
      await queryClient.invalidateQueries({ queryKey: ['store', slug] })
    },
  })

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

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_24rem]">
      <div className="space-y-6">
        <Card>
          <CardHeader title="Theme presets" subtitle="One click to apply a curated palette — then fine-tune below." />
          <CardBody>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {THEME_PRESETS.map((preset) => (
                <ThemePresetButton key={preset.name} preset={preset} onSelect={() => applyPreset(preset)} />
              ))}
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
          <CardHeader title="Brand colors" subtitle="Primary drives buttons, links, and accents across your store." />
          <CardBody className="grid gap-5 sm:grid-cols-2">
            <ColorField label="Primary / button color" value={form.primaryColor} fallback={DEFAULTS.primaryColor} onChange={(v) => set('primaryColor', v)} />
            <ColorField label="Accent color" value={form.accentColor} fallback={DEFAULTS.accentColor} onChange={(v) => set('accentColor', v)} />
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
            title="Dark mode palette"
            subtitle="Optional: shown when shoppers use the dark theme toggle. Leave blank to auto-derive a dark look from your main colors."
          />
          <CardBody className="grid gap-5 sm:grid-cols-2">
            <ColorField label="Primary / button color" value={form.darkColors.primaryColor} fallback={DEFAULTS.primaryColor} onChange={(v) => setDark('primaryColor', v)} />
            <ColorField label="Accent color" value={form.darkColors.accentColor} fallback={DEFAULTS.accentColor} onChange={(v) => setDark('accentColor', v)} />
            <ColorField label="Page background" value={form.darkColors.backgroundColor} fallback="#0f1220" onChange={(v) => setDark('backgroundColor', v)} />
            <ColorField label="Card / surface" value={form.darkColors.surfaceColor} fallback="#171b2e" onChange={(v) => setDark('surfaceColor', v)} />
            <ColorField label="Text color" value={form.darkColors.textColor} fallback="#f5f6fb" onChange={(v) => setDark('textColor', v)} />
            <ColorField label="Muted text" value={form.darkColors.mutedColor} fallback="#aab0cb" onChange={(v) => setDark('mutedColor', v)} />
            <ColorField label="Border color" value={form.darkColors.borderColor} fallback="#2a2f47" onChange={(v) => setDark('borderColor', v)} />
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Logo & hero image" subtitle="Paste hosted image URLs (https:// or a /path)." />
          <CardBody className="space-y-4">
            <ImageUploadField
              label="Logo / icon"
              placeholder="https://…/logo.png"
              value={form.logoUrl}
              onChange={(value) => set('logoUrl', value)}
              hint="Upload an image or paste a URL — also used by the loading screen."
            />
            <ImageUploadField
              label="Hero banner image"
              placeholder="https://…/banner.jpg"
              value={form.heroImageUrl}
              onChange={(value) => set('heroImageUrl', value)}
              hint="Upload an image or paste a URL."
            />
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Messaging" subtitle="Headline and supporting copy for your storefront banner." />
          <CardBody className="space-y-4">
            <Input label="Tagline" placeholder="Your local Magic singles shop" maxLength={160} value={form.tagline} onChange={(e) => set('tagline', e.target.value)} />
            <Input label="Hero heading" placeholder="Defaults to your store name" maxLength={160} value={form.heroHeading} onChange={(e) => set('heroHeading', e.target.value)} />
            <Textarea label="Hero subheading" rows={3} placeholder="A sentence or two about your store, shipping, or specialties." value={form.heroSubheading} onChange={(e) => set('heroSubheading', e.target.value)} />
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
              <Input label="Contact email" type="email" placeholder="hello@yourstore.com" value={form.contactEmail} onChange={(e) => set('contactEmail', e.target.value)} />
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
        </div>
      </div>

      {/* Live preview */}
      <div className="xl:sticky xl:top-8 xl:self-start">
        <p className="mb-3 text-xs font-bold uppercase tracking-wide text-fg-muted">Live store preview</p>
        <StorePreview branding={form} storeName={store?.name ?? slug} />
        <p className="mt-3 text-xs text-fg-muted">
          A live preview of your storefront — background, cards, text, buttons, and accents update as you edit.
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
  icon: LucideIcon
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
