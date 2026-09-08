import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Eye, EyeOff, Trash2 } from 'lucide-react'
import { useState } from 'react'
import api, { extractErrorMessage } from '../../api/client'
import type { Store, StoreFeatureKey } from '../../api/types'
import {
  activeStoresKey,
  inventoryKey,
  inventoryPageKey,
  sealedInventoryKey,
  sealedPublicKey,
  sealedSpotlightKey,
  storeCasesKey,
  storeGamesKey,
  storeSectionsKey,
  storeSpotlightKey,
  useStore,
} from '../../hooks'
import { Button, Card, CardBody, CardHeader, Input } from '../../components/ui'
import { cx } from '../../lib/cx'
import {
  STORE_FEATURE_KEYS,
  STORE_FEATURE_META,
  isStoreFeatureEnabled,
  resolveStoreFeatures,
} from '../../lib/storeFeatures'

interface ClearInventoryResult {
  deletedSingles: number
  deletedSealed: number
}

function SegmentedToggle({
  value,
  onChange,
  disabled,
  offLabel,
  onLabel,
  name,
}: {
  value: boolean
  onChange: (next: boolean) => void
  disabled?: boolean
  offLabel: string
  onLabel: string
  name: string
}) {
  return (
    <div
      className="inline-flex shrink-0 rounded-lg border border-border bg-bg p-0.5"
      role="group"
      aria-label={name}
    >
      <button
        type="button"
        disabled={disabled}
        aria-pressed={!value}
        onClick={() => onChange(false)}
        className={cx(
          'min-w-16 rounded-md px-3 py-1.5 text-xs font-bold transition-colors',
          !value ? 'bg-surface text-fg shadow-sm' : 'text-fg-muted hover:text-fg',
        )}
      >
        {offLabel}
      </button>
      <button
        type="button"
        disabled={disabled}
        aria-pressed={value}
        onClick={() => onChange(true)}
        className={cx(
          'min-w-16 rounded-md px-3 py-1.5 text-xs font-bold transition-colors',
          value ? 'bg-brand-500 text-white shadow-sm' : 'text-fg-muted hover:text-fg',
        )}
      >
        {onLabel}
      </button>
    </div>
  )
}

export default function AdminSettingsTab({ slug }: { slug: string }) {
  const queryClient = useQueryClient()
  const { data: store } = useStore(slug)
  const [armed, setArmed] = useState(false)
  const [confirmSlug, setConfirmSlug] = useState('')

  const listed = store?.isListed !== false

  const settingsMutation = useMutation({
    mutationFn: async (payload: { isListed?: boolean; features?: Partial<Record<StoreFeatureKey, boolean>> }) => {
      const { data } = await api.patch<Store>(`/stores/${slug}/settings`, payload)
      return data
    },
    onMutate: async (payload) => {
      await queryClient.cancelQueries({ queryKey: ['store', slug] })
      const previous = queryClient.getQueryData<Store>(['store', slug])
      queryClient.setQueryData<Store>(['store', slug], (current) => {
        if (!current) return current
        return {
          ...current,
          ...(payload.isListed !== undefined ? { isListed: payload.isListed } : {}),
          ...(payload.features
            ? { features: { ...resolveStoreFeatures(current.features), ...payload.features } }
            : {}),
        }
      })
      return { previous }
    },
    onError: (_error, _payload, context) => {
      if (context?.previous) {
        queryClient.setQueryData(['store', slug], context.previous)
      }
    },
    onSuccess: async (saved) => {
      queryClient.setQueryData<Store>(['store', slug], (current) => ({ ...(current ?? {}), ...saved }))
      await queryClient.invalidateQueries({ queryKey: ['store', slug] })
      await queryClient.invalidateQueries({ queryKey: activeStoresKey })
    },
  })

  const clearInventory = useMutation({
    mutationFn: async () => {
      const { data } = await api.post<ClearInventoryResult>(`/stores/${slug}/settings/clear-inventory`, {
        confirmSlug: confirmSlug.trim(),
      })
      return data
    },
    onSuccess: async () => {
      setArmed(false)
      setConfirmSlug('')
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: inventoryKey(slug) }),
        queryClient.invalidateQueries({ queryKey: inventoryPageKey(slug) }),
        queryClient.invalidateQueries({ queryKey: sealedInventoryKey(slug) }),
        queryClient.invalidateQueries({ queryKey: sealedPublicKey(slug) }),
        queryClient.invalidateQueries({ queryKey: sealedSpotlightKey(slug) }),
        queryClient.invalidateQueries({ queryKey: storeCasesKey(slug) }),
        queryClient.invalidateQueries({ queryKey: storeSectionsKey(slug) }),
        queryClient.invalidateQueries({ queryKey: storeGamesKey(slug) }),
        queryClient.invalidateQueries({ queryKey: storeSpotlightKey(slug) }),
        queryClient.invalidateQueries({ queryKey: ['store-game-stats', slug] }),
        queryClient.invalidateQueries({ queryKey: ['store-game-shelf', slug] }),
      ])
    },
  })

  const slugMatches = Boolean(store?.slug) && confirmSlug.trim() === store?.slug
  const saving = settingsMutation.isPending

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader
          title="Marketplace listing"
          subtitle="Public stores appear in the directory and sitemap. Private stores stay off the list; anyone with your link can still visit."
        />
        <CardBody className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <span
              className={cx(
                'mt-0.5 grid size-9 place-items-center rounded-xl border',
                listed
                  ? 'border-brand-500/30 bg-brand-500/12 text-brand-600'
                  : 'border-border bg-bg text-fg-muted',
              )}
            >
              {listed ? <Eye aria-hidden className="size-4" /> : <EyeOff aria-hidden className="size-4" />}
            </span>
            <div>
              <p className="text-sm font-bold text-fg">{listed ? 'Public' : 'Private'}</p>
              <p className="text-sm text-fg-muted">
                {listed
                  ? 'Listed on the site so shoppers can find you.'
                  : 'Hidden from the store directory. Your storefront link still works.'}
              </p>
            </div>
          </div>
          <SegmentedToggle
            name="Marketplace visibility"
            value={listed}
            offLabel="Private"
            onLabel="Public"
            disabled={!store || saving}
            onChange={(next) => settingsMutation.mutate({ isListed: next })}
          />
        </CardBody>
        {settingsMutation.isError && (
          <CardBody className="pt-0">
            <p role="alert" className="text-sm font-medium text-danger-700">
              {extractErrorMessage(settingsMutation.error, 'Could not save settings.')}
            </p>
          </CardBody>
        )}
      </Card>

      <Card>
        <CardHeader
          title="Storefront features"
          subtitle="Turn shopper-facing tools on or off. Admin pages stay available so you can set things up before going live."
        />
        <CardBody className="divide-y divide-border">
          {STORE_FEATURE_KEYS.map((key) => {
            const meta = STORE_FEATURE_META[key]
            const on = isStoreFeatureEnabled(store, key)
            return (
              <div
                key={key}
                className="flex flex-col gap-3 py-4 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <p className="text-sm font-bold text-fg">{meta.label}</p>
                  <p className="text-sm text-fg-muted">{meta.description}</p>
                </div>
                <SegmentedToggle
                  name={meta.label}
                  value={on}
                  offLabel="Off"
                  onLabel="On"
                  disabled={!store || saving}
                  onChange={(next) => settingsMutation.mutate({ features: { [key]: next } })}
                />
              </div>
            )
          })}
        </CardBody>
      </Card>

      <Card className="border-danger-500/40">
        <CardHeader
          title="Delete all inventory"
          subtitle="Permanently removes every singles listing and sealed product from this store. Case cards, carts, and favorites for those listings are removed too. Past orders stay on file, but they will no longer point at the listings. This cannot be undone."
        />
        <CardBody className="space-y-4">
          {!armed ? (
            <Button variant="ghost" className="text-danger-700" onClick={() => setArmed(true)}>
              <Trash2 aria-hidden className="size-4" />
              Delete all inventory…
            </Button>
          ) : (
            <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
              <div className="sm:max-w-xs sm:flex-1">
                <Input
                  label={`Type "${store?.slug ?? slug}" to confirm`}
                  value={confirmSlug}
                  onChange={(e) => setConfirmSlug(e.target.value)}
                  autoComplete="off"
                  spellCheck={false}
                />
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="danger"
                  loading={clearInventory.isPending}
                  disabled={!slugMatches}
                  onClick={() => clearInventory.mutate()}
                >
                  <Trash2 aria-hidden className="size-4" />
                  Permanently delete inventory
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => {
                    setArmed(false)
                    setConfirmSlug('')
                    clearInventory.reset()
                  }}
                >
                  Cancel
                </Button>
              </div>
            </div>
          )}
          {clearInventory.isSuccess && (
            <p role="status" className="text-sm font-medium text-success-700">
              Removed {clearInventory.data.deletedSingles} singles listing
              {clearInventory.data.deletedSingles === 1 ? '' : 's'} and {clearInventory.data.deletedSealed} sealed
              product{clearInventory.data.deletedSealed === 1 ? '' : 's'}.
            </p>
          )}
          {clearInventory.isError && (
            <p role="alert" className="text-sm font-medium text-danger-700">
              {extractErrorMessage(clearInventory.error, 'Could not delete inventory.')}
            </p>
          )}
        </CardBody>
      </Card>
    </div>
  )
}
