import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import api, { WANT_LIST_MAX, extractErrorMessage } from '../../api/client'
import { customerKeys, useCatalogGames, useMyWantList } from '../../hooks'
import { parseDecklist } from '../../lib/parseDecklist'
import { Button, Select, Textarea } from '../ui'

const MAX_PARSE = 200
const PLACEHOLDER = ['4 Lightning Bolt', '2x Counterspell', 'Sol Ring', '# lines starting with # are ignored'].join('\n')

type StoreOption = { slug: string; name: string }

export function WantListBulkForm({
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
  const [text, setText] = useState('')
  const [game, setGame] = useState('')
  const [targetSlug, setTargetSlug] = useState(defaultStoreSlug ?? '')

  const needsStorePicker = stores.length > 1 && !defaultStoreSlug
  const resolvedSlug = defaultStoreSlug || (stores.length === 1 ? stores[0].slug : targetSlug)
  const usage = useMyWantList(1, resolvedSlug || undefined, Boolean(resolvedSlug))
  const used = usage.data?.total ?? 0
  const remaining = Math.max(0, WANT_LIST_MAX - used)
  const parsed = useMemo(() => parseDecklist(text), [text])
  const lines = parsed.slice(0, MAX_PARSE)
  const overflow = Math.max(0, parsed.length - MAX_PARSE)

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

  const addMutation = useMutation({
    mutationFn: async () => {
      if (!resolvedSlug) throw new Error('Choose a store')
      const { data } = await api.post<{
        added: number
        skipped: number
        remaining: number
        unresolved: { name: string; quantity: number }[]
      }>(`/stores/${resolvedSlug}/customer/want-list/bulk`, {
        game,
        lines: lines.map((line) => ({ name: line.name, quantity: line.quantity })),
      })
      return data
    },
    onSuccess: () => {
      setText('')
      if (resolvedSlug) {
        void queryClient.invalidateQueries({ queryKey: ['my-want-list'] })
        void queryClient.invalidateQueries({ queryKey: customerKeys.wantList(resolvedSlug) })
      }
    },
  })

  return (
    <form
      className="mb-6 space-y-4 border-b border-border pb-5"
      onSubmit={(event) => {
        event.preventDefault()
        if (lines.length > 0 && resolvedSlug && remaining > 0) addMutation.mutate()
      }}
    >
      <p className="text-sm text-fg-muted">
        One card per line, same format as Mass Search. Matched names are added to this store&apos;s want list
        ({WANT_LIST_MAX} card max).
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        {gameOptions.length > 1 ? (
          <Select label="Game" value={game} onChange={(event) => setGame(event.target.value)}>
            {gameOptions.map((option) => (
              <option key={option.code} value={option.code}>
                {option.name}
              </option>
            ))}
          </Select>
        ) : null}
        {needsStorePicker ? (
          <Select
            label="Store"
            value={targetSlug}
            onChange={(event) => setTargetSlug(event.target.value)}
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
      </div>
      <Textarea
        label="Card list"
        rows={8}
        value={text}
        onChange={(event) => setText(event.target.value)}
        placeholder={PLACEHOLDER}
      />
      {resolvedSlug ? (
        <p className="text-sm text-fg-muted">
          {used} / {WANT_LIST_MAX} cards at this store
          {remaining === 0 ? ' — list is full.' : remaining < WANT_LIST_MAX ? ` · ${remaining} left.` : '.'}
        </p>
      ) : null}
      {overflow > 0 ? (
        <p className="text-sm text-warning-700">Only the first {MAX_PARSE} names will be sent ({overflow} ignored).</p>
      ) : null}
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" loading={addMutation.isPending} disabled={lines.length === 0 || !resolvedSlug || remaining === 0}>
          Add {lines.length || ''} {lines.length === 1 ? 'card' : 'cards'}
        </Button>
        {addMutation.data ? (
          <p className="text-sm text-fg-muted">
            Added {addMutation.data.added}
            {addMutation.data.unresolved.length > 0 ? ` · ${addMutation.data.unresolved.length} unmatched` : ''}
            {addMutation.data.skipped > 0 ? ` · ${addMutation.data.skipped} over the limit` : ''}.
          </p>
        ) : null}
      </div>
      {addMutation.data && addMutation.data.unresolved.length > 0 ? (
        <p className="text-sm text-warning-700">
          Could not match: {addMutation.data.unresolved.map((line) => line.name).join(', ')}
        </p>
      ) : null}
      {addMutation.isError ? (
        <p role="alert" className="text-sm font-medium text-danger-700">
          {extractErrorMessage(addMutation.error, 'Could not add those cards. Please try again.')}
        </p>
      ) : null}
    </form>
  )
}
