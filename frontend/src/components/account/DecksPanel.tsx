import { useState } from 'react'
import { Link } from 'react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { BookOpen, Layers, Plus, Store as StoreIcon, Trash2, X } from 'lucide-react'
import api, { cardImage, extractErrorMessage } from '../../api/client'
import type { Deck } from '../../api/types'
import { Button, Card, CardBody, CardHeader, EmptyState, Input, LoadingPanel, Modal, Textarea } from '../ui'

const decksKey = ['my-decks'] as const

/** Written by the deck panel, read once by MassSearchPage to prefill its list. */
export const MASS_SEARCH_PREFILL_KEY = 'mass-search-prefill'

/**
 * Saved decks on the global account page. Decks are store-independent:
 * build the list once, then check it against any store's stock via the
 * mass-search prefill hand-off.
 */
export function DecksPanel({ stores }: { stores: { slug: string; name: string }[] }) {
  const queryClient = useQueryClient()
  const [creating, setCreating] = useState(false)
  const [openDeckId, setOpenDeckId] = useState<number | null>(null)

  const decksQuery = useQuery({
    queryKey: decksKey,
    queryFn: async () => {
      const { data } = await api.get<Deck[]>('/me/decks')
      return data
    },
  })

  const invalidate = () => queryClient.invalidateQueries({ queryKey: decksKey })

  return (
    <Card>
      <CardHeader
        title={
          <span className="inline-flex items-center gap-2">
            <Layers aria-hidden className="size-4 text-brand-600" />
            My decks
          </span>
        }
        subtitle="Build a deck once, then check it against any store's stock."
        actions={
          <Button size="sm" onClick={() => setCreating(true)}>
            <Plus aria-hidden className="size-4" />
            New deck
          </Button>
        }
      />
      <CardBody>
        {decksQuery.isLoading ? (
          <LoadingPanel />
        ) : (decksQuery.data?.length ?? 0) === 0 ? (
          <EmptyState
            icon={BookOpen}
            title="No decks yet"
            description="Paste a decklist to save your first deck — quantities like “4x” are optional."
            action={
              <Button variant="secondary" onClick={() => setCreating(true)}>
                <Plus aria-hidden className="size-4" />
                Create a deck
              </Button>
            }
          />
        ) : (
          <ul className="space-y-2">
            {decksQuery.data!.map((deck) => (
              <li key={deck.id} className="flex flex-wrap items-center gap-3 rounded-card border border-border bg-surface p-3">
                <span className="grid size-10 shrink-0 place-items-center rounded-btn bg-brand-50 text-brand-600">
                  <BookOpen aria-hidden className="size-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-bold text-fg">{deck.name}</p>
                  <p className="text-xs text-fg-muted">
                    {deck.cardCount} cards
                    {deck.format ? ` · ${deck.format}` : ''}
                    {` · updated ${new Date(deck.updatedAt).toLocaleDateString()}`}
                  </p>
                </div>
                <Button size="sm" variant="secondary" onClick={() => setOpenDeckId(deck.id)}>
                  Open
                </Button>
              </li>
            ))}
          </ul>
        )}
      </CardBody>

      {creating && <CreateDeckModal onClose={() => setCreating(false)} onCreated={async () => { setCreating(false); await invalidate() }} />}
      {openDeckId != null && (
        <DeckModal deckId={openDeckId} stores={stores} onClose={() => setOpenDeckId(null)} onChanged={invalidate} />
      )}
    </Card>
  )
}

function CreateDeckModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => Promise<void> }) {
  const [name, setName] = useState('')
  const [format, setFormat] = useState('')
  const [list, setList] = useState('')

  const create = useMutation({
    mutationFn: async () => {
      await api.post<Deck>('/me/decks', { name: name.trim(), format: format.trim(), list })
    },
    onSuccess: onCreated,
  })

  return (
    <Modal open onClose={onClose} title="New deck">
      <div className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_10rem]">
          <Input label="Deck name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Mono-Red Burn" maxLength={120} />
          <Input label="Format" value={format} onChange={(e) => setFormat(e.target.value)} placeholder="Commander" maxLength={40} />
        </div>
        <Textarea
          label="Decklist (optional — one card per line)"
          rows={8}
          value={list}
          onChange={(e) => setList(e.target.value)}
          placeholder={'4 Lightning Bolt\n2x Counterspell\nSol Ring'}
          className="font-mono text-sm"
        />
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button loading={create.isPending} disabled={!name.trim()} onClick={() => create.mutate()}>
            Create deck
          </Button>
        </div>
        {create.isError && (
          <p role="alert" className="text-sm font-medium text-danger-700">
            {extractErrorMessage(create.error, 'Could not create the deck.')}
          </p>
        )}
      </div>
    </Modal>
  )
}

/** Deck detail: edit lines, add cards by name, hand off to a store's mass search. */
function DeckModal({
  deckId,
  stores,
  onClose,
  onChanged,
}: {
  deckId: number
  stores: { slug: string; name: string }[]
  onClose: () => void
  onChanged: () => void
}) {
  const queryClient = useQueryClient()
  const deckKey = ['my-deck', deckId] as const
  const [newCardName, setNewCardName] = useState('')

  const deckQuery = useQuery({
    queryKey: deckKey,
    queryFn: async () => {
      const { data } = await api.get<Deck>(`/me/decks/${deckId}`)
      return data
    },
  })

  const applyDeck = (deck: Deck) => {
    queryClient.setQueryData(deckKey, deck)
    onChanged()
  }

  const addCard = useMutation({
    mutationFn: async () => {
      const { data } = await api.post<Deck>(`/me/decks/${deckId}/cards`, { name: newCardName.trim(), quantity: 1 })
      return data
    },
    onSuccess: (deck) => {
      setNewCardName('')
      applyDeck(deck)
    },
  })

  const updateLine = useMutation({
    mutationFn: async ({ lineId, quantity }: { lineId: number; quantity: number }) => {
      const { data } = await api.patch<Deck>(`/me/decks/${deckId}/cards/${lineId}`, { quantity })
      return data
    },
    onSuccess: applyDeck,
  })

  const removeLine = useMutation({
    mutationFn: async (lineId: number) => {
      const { data } = await api.delete<Deck>(`/me/decks/${deckId}/cards/${lineId}`)
      return data
    },
    onSuccess: applyDeck,
  })

  const removeDeck = useMutation({
    mutationFn: async () => {
      await api.delete(`/me/decks/${deckId}`)
    },
    onSuccess: () => {
      onChanged()
      onClose()
    },
  })

  const deck = deckQuery.data
  const decklistText = (deck?.cards ?? []).map((line) => `${line.quantity} ${line.cardName}`).join('\n')

  /** Hand the list to a store's mass search (it reads the key on mount). */
  const checkAtStore = () => {
    try {
      sessionStorage.setItem(MASS_SEARCH_PREFILL_KEY, decklistText)
    } catch {
      // Storage unavailable — the link still opens the page, just unprefilled.
    }
  }

  return (
    <Modal open onClose={onClose} title={deck?.name ?? 'Deck'} className="max-w-2xl">
      {deckQuery.isLoading || !deck ? (
        <LoadingPanel />
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2 text-sm text-fg-muted">
            <span>{deck.cardCount} cards</span>
            {deck.format && <span>· {deck.format}</span>}
          </div>

          <ul className="max-h-[40vh] space-y-1 overflow-y-auto pr-1">
            {(deck.cards ?? []).map((line) => (
              <li key={line.id} className="flex items-center gap-2 rounded-btn border border-border bg-surface px-2 py-1.5 text-sm">
                {line.imageUris && cardImage({ imageUris: line.imageUris }) && (
                  <img src={cardImage({ imageUris: line.imageUris })} alt="" className="h-10 w-7 shrink-0 rounded object-cover" />
                )}
                <span className="min-w-0 flex-1 truncate font-medium text-fg">
                  {line.cardName}
                  {line.cardId == null && <span className="ml-1 text-xs text-fg-muted">(not in catalog)</span>}
                </span>
                <input
                  type="number"
                  min={1}
                  value={line.quantity}
                  aria-label={`Copies of ${line.cardName}`}
                  onChange={(e) => {
                    const quantity = Math.max(1, Number(e.target.value) || 1)
                    if (quantity !== line.quantity) updateLine.mutate({ lineId: line.id, quantity })
                  }}
                  className="w-14 rounded-btn border border-border bg-surface px-2 py-1 text-fg"
                />
                <button
                  type="button"
                  aria-label={`Remove ${line.cardName}`}
                  onClick={() => removeLine.mutate(line.id)}
                  className="rounded-full p-1 text-fg-muted hover:bg-bg hover:text-danger-700"
                >
                  <X className="size-4" aria-hidden />
                </button>
              </li>
            ))}
          </ul>

          <div className="flex items-end gap-2">
            <div className="min-w-0 flex-1">
              <Input
                label="Add a card"
                value={newCardName}
                onChange={(e) => setNewCardName(e.target.value)}
                placeholder="Card name…"
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && newCardName.trim()) addCard.mutate()
                }}
              />
            </div>
            <Button variant="secondary" loading={addCard.isPending} disabled={!newCardName.trim()} onClick={() => addCard.mutate()}>
              <Plus aria-hidden className="size-4" />
              Add
            </Button>
          </div>

          {stores.length > 0 && (deck.cards?.length ?? 0) > 0 && (
            <div className="space-y-2 border-t border-border pt-3">
              <p className="text-xs font-bold uppercase tracking-wide text-fg-muted">Check availability</p>
              <div className="flex flex-wrap gap-2">
                {stores.map((store) => (
                  <Link
                    key={store.slug}
                    to={`/s/${store.slug}/mass-search`}
                    onClick={checkAtStore}
                    className="inline-flex items-center gap-1.5 rounded-btn border border-border bg-surface px-3 py-1.5 text-sm font-medium text-fg hover:border-brand-300"
                  >
                    <StoreIcon aria-hidden className="size-4 text-brand-600" />
                    {store.name}
                  </Link>
                ))}
              </div>
            </div>
          )}

          <div className="flex justify-between border-t border-border pt-3">
            <Button variant="ghost" className="text-danger-700" loading={removeDeck.isPending} onClick={() => removeDeck.mutate()}>
              <Trash2 aria-hidden className="size-4" />
              Delete deck
            </Button>
            <Button variant="secondary" onClick={onClose}>
              Done
            </Button>
          </div>
        </div>
      )}
    </Modal>
  )
}

export default DecksPanel
