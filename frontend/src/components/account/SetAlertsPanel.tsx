import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { BellRing, Trash2 } from 'lucide-react'
import api, { ACCOUNT_PAGE_SIZE, extractErrorMessage } from '../../api/client'
import type { CustomerSetAlert } from '../../api/types'
import { useCatalogGames, useGameSets, useMySetAlerts } from '../../hooks'
import { SetCodeTypeahead } from '../catalog'
import { ProfileSection } from '../profile'
import { Badge, Button, EmptyState, ErrorState, LoadingPanel, Pagination, Select } from '../ui'

type StoreOption = { slug: string; name: string }

export function SetAlertsPanel({
  stores,
  storeSlug,
}: {
  stores: StoreOption[]
  storeSlug?: string
}) {
  const [page, setPage] = useState(1)
  const query = useMySetAlerts(page, storeSlug)
  const alerts = query.data?.items ?? []

  useEffect(() => {
    setPage(1)
  }, [storeSlug])

  return (
    <ProfileSection title="Set alerts">
      <p className="mb-4 text-sm text-fg-muted">
        Get notified when a store restocks any card from a set you watch: imports, singles, or Complete &amp; stock.
      </p>
      <SetAlertSubscribeForm stores={stores} defaultStoreSlug={storeSlug} />

      {query.isLoading ? (
        <LoadingPanel bare label="Loading set alerts…" />
      ) : query.isError ? (
        <ErrorState title="Could not load set alerts." onRetry={() => void query.refetch()} />
      ) : alerts.length === 0 ? (
        <EmptyState
          icon={BellRing}
          title="No set watches yet"
          description="Pick a store and a set above. We will email you the next time that set is restocked."
        />
      ) : (
        <ul className="divide-y divide-border">
          {alerts.map((alert) => (
            <SetAlertRow key={alert.id} alert={alert} />
          ))}
        </ul>
      )}
      {(query.data?.total ?? 0) > 0 ? (
        <Pagination
          className="mt-4"
          page={page}
          pageCount={Math.max(1, Math.ceil((query.data?.total ?? 0) / ACCOUNT_PAGE_SIZE))}
          onPageChange={setPage}
          totalItems={query.data?.total}
        />
      ) : null}
    </ProfileSection>
  )
}

function SetAlertRow({ alert }: { alert: CustomerSetAlert }) {
  const queryClient = useQueryClient()
  const remove = useMutation({
    mutationFn: async () => {
      await api.delete(`/me/set-alerts/${alert.id}`)
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['my-set-alerts'] })
    },
  })

  return (
    <li className="flex items-start justify-between gap-3 py-3">
      <div className="min-w-0">
        <p className="font-semibold text-fg">{alert.setName}</p>
        <div className="mt-1 flex flex-wrap gap-1">
          <Badge className="px-2 py-0 text-[11px]">{alert.setCode.toUpperCase()}</Badge>
          {alert.storeName ? (
            <Badge tone="brand" className="px-2 py-0 text-[11px]">
              {alert.storeName}
            </Badge>
          ) : null}
        </div>
      </div>
      <button
        type="button"
        className="grid size-9 shrink-0 place-items-center rounded-lg text-fg-muted hover:bg-bg hover:text-danger-700"
        disabled={remove.isPending}
        onClick={() => remove.mutate()}
        aria-label={`Stop watching ${alert.setName}`}
      >
        <Trash2 aria-hidden className="size-4" />
      </button>
    </li>
  )
}

function SetAlertSubscribeForm({
  stores,
  defaultStoreSlug,
}: {
  stores: StoreOption[]
  defaultStoreSlug?: string
}) {
  const queryClient = useQueryClient()
  const { data: games = [] } = useCatalogGames()
  const gameOptions = useMemo(
    () => games.map((game) => ({ code: game.code, name: game.name })),
    [games],
  )
  const [game, setGame] = useState('')
  const [setCode, setSetCode] = useState('')
  const [targetSlug, setTargetSlug] = useState(defaultStoreSlug ?? '')
  const { data: catalogSets = [] } = useGameSets(game)
  const setOptions = useMemo(
    () =>
      catalogSets
        .filter((set) => Boolean(set.code))
        .map((set) => ({ code: set.code as string, name: set.name })),
    [catalogSets],
  )

  const needsStorePicker = stores.length > 1 && !defaultStoreSlug
  const resolvedSlug = defaultStoreSlug || (stores.length === 1 ? stores[0].slug : targetSlug)

  useEffect(() => {
    if (defaultStoreSlug) {
      setTargetSlug(defaultStoreSlug)
      return
    }
    if (stores.length === 1) setTargetSlug(stores[0].slug)
  }, [defaultStoreSlug, stores])

  useEffect(() => {
    if (!game && gameOptions.length > 0) setGame(gameOptions[0].code)
  }, [game, gameOptions])

  const subscribe = useMutation({
    mutationFn: async () => {
      if (!resolvedSlug) throw new Error('Choose a store')
      if (!setCode.trim()) throw new Error('Pick a set')
      await api.post('/me/set-alerts', {
        store: resolvedSlug,
        game,
        setCode: setCode.trim(),
      })
    },
    onSuccess: () => {
      setSetCode('')
      void queryClient.invalidateQueries({ queryKey: ['my-set-alerts'] })
    },
  })

  return (
    <form
      className="mb-6 space-y-3 border-b border-border pb-5"
      onSubmit={(event) => {
        event.preventDefault()
        if (resolvedSlug && setCode.trim()) subscribe.mutate()
      }}
    >
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
        {needsStorePicker ? (
          <Select
            label="Store"
            value={targetSlug}
            onChange={(event) => setTargetSlug(event.target.value)}
            wrapperClassName="min-w-[10rem] flex-1"
            required
          >
            <option value="">Choose a store</option>
            {stores.map((store) => (
              <option key={store.slug} value={store.slug}>
                {store.name}
              </option>
            ))}
          </Select>
        ) : null}
        {gameOptions.length > 1 ? (
          <Select
            label="Game"
            value={game}
            onChange={(event) => {
              setGame(event.target.value)
              setSetCode('')
            }}
            wrapperClassName="sm:w-48"
          >
            {gameOptions.map((option) => (
              <option key={option.code} value={option.code}>
                {option.name}
              </option>
            ))}
          </Select>
        ) : null}
        <div className="min-w-0 flex-1">
          <p className="mb-1.5 text-sm font-bold text-fg">Set</p>
          <SetCodeTypeahead
            id="set-alert-set"
            value={setCode}
            onChange={setSetCode}
            sets={setOptions}
            listboxId="set-alert-set-list"
            ariaLabel="Set"
            placeholder="Choose a set"
            emptyLabel="Choose a set"
            required
            onEnter={() => {
              if (resolvedSlug && setCode.trim()) subscribe.mutate()
            }}
          />
        </div>
        <Button type="submit" loading={subscribe.isPending} disabled={!resolvedSlug || !setCode.trim()}>
          Watch set
        </Button>
      </div>
      {subscribe.isError ? (
        <p role="alert" className="text-sm font-medium text-danger-700">
          {extractErrorMessage(subscribe.error, 'Could not save that set alert.')}
        </p>
      ) : null}
    </form>
  )
}
