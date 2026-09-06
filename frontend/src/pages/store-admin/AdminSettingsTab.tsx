import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Trash2 } from 'lucide-react'
import api, { extractErrorMessage } from '../../api/client'
import {
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

interface ClearInventoryResult {
  deletedSingles: number
  deletedSealed: number
}

export default function AdminSettingsTab({ slug }: { slug: string }) {
  const queryClient = useQueryClient()
  const { data: store } = useStore(slug)
  const [armed, setArmed] = useState(false)
  const [confirmSlug, setConfirmSlug] = useState('')

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

  return (
    <div className="space-y-6">
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
