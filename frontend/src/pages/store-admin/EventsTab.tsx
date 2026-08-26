import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Calendar, Pin, Plus, Trash2 } from 'lucide-react'
import api, { extractErrorMessage } from '../../api/client'
import type { StoreCommunityEventItem, StoreCommunityEvents } from '../../api/types'
import { useStore } from '../../hooks'
import { Button, Card, CardBody, CardHeader, Field, Input, Textarea } from '../../components/ui'
import { CommunityBoard } from '../../components/store/events/CommunityBoard'
import {
  datetimeLocalToIso,
  EMPTY_COMMUNITY_EVENTS,
  isoToDatetimeLocal,
  newEventId,
  formatEventDateTime,
  normalizeCommunityEvents,
} from '../../components/store/events/communityEvents'

function emptyDraft(): StoreCommunityEventItem {
  const starts = new Date()
  starts.setMinutes(0, 0, 0)
  starts.setHours(starts.getHours() + 2)
  return {
    id: newEventId(),
    title: '',
    startsAt: starts.toISOString(),
    description: '',
    location: '',
    externalUrl: '',
    pinned: false,
  }
}

export default function EventsTab({ slug }: { slug: string }) {
  const queryClient = useQueryClient()
  const { data: store } = useStore(slug)
  const [form, setForm] = useState<StoreCommunityEvents>({ ...EMPTY_COMMUNITY_EVENTS, items: [] })
  const [draft, setDraft] = useState<StoreCommunityEventItem>(() => emptyDraft())
  const [editingId, setEditingId] = useState<string | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const trainingMode = useMemo(
    () => new URLSearchParams(window.location.search).get('training') === '1',
    [],
  )

  useEffect(() => {
    if (!trainingMode) return
    const onFill = (event: Event) => {
      const detail = (event as CustomEvent<{ guide?: string; value?: string }>).detail
      if (detail?.guide === 'Event title' && detail.value != null) {
        setDraft((current) => ({ ...current, title: detail.value ?? '' }))
      }
    }
    document.addEventListener('training:fill-guide', onFill as EventListener)
    return () => document.removeEventListener('training:fill-guide', onFill as EventListener)
  }, [trainingMode])

  useEffect(() => {
    if (store) {
      setForm(normalizeCommunityEvents(store.communityEvents))
    }
  }, [store])

  const preview = useMemo(() => normalizeCommunityEvents(form), [form])

  const saveMutation = useMutation({
    mutationFn: async () => {
      setErrorMessage(null)
      await api.patch(`/stores/${slug}/settings`, { communityEvents: form })
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['store', slug] })
    },
    onError: (err) => {
      setErrorMessage(extractErrorMessage(err, 'Could not save events.'))
    },
  })

  function updateBoard(patch: Partial<StoreCommunityEvents>) {
    setForm((prev) => ({ ...prev, ...patch }))
  }

  function removeEvent(id: string) {
    setForm((prev) => ({ ...prev, items: prev.items.filter((e) => e.id !== id) }))
    if (editingId === id) {
      setEditingId(null)
      setDraft(emptyDraft())
    }
  }

  function startEdit(event: StoreCommunityEventItem) {
    setEditingId(event.id)
    setDraft({ ...event })
  }

  function commitDraft() {
    const title = draft.title.trim()
    if (!title) return
    const row: StoreCommunityEventItem = {
      ...draft,
      title,
      startsAt: datetimeLocalToIso(isoToDatetimeLocal(draft.startsAt) || draft.startsAt),
      description: draft.description?.trim() || undefined,
      location: draft.location?.trim() || undefined,
      externalUrl: draft.externalUrl?.trim() || undefined,
      pinned: Boolean(draft.pinned),
    }
    setForm((prev) => {
      const exists = prev.items.some((e) => e.id === row.id)
      const items = exists ? prev.items.map((e) => (e.id === row.id ? row : e)) : [...prev.items, row]
      return { ...prev, items }
    })
    setEditingId(null)
    setDraft(emptyDraft())
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(18rem,22rem)]">
      <div className="space-y-6">
        <Card>
          <CardHeader
            title="Community board"
            subtitle="Headings and copy appear on the Event board hero layout and on your public event calendar page."
          />
          <CardBody className="space-y-4">
            <Field label="Board heading" className="[&]:contents">
              {({ id }) => (
                <Input
                  id={id}
                  data-guide="Board heading"
                  value={form.boardHeading ?? ''}
                  onChange={(e) => updateBoard({ boardHeading: e.target.value })}
                  placeholder="Community board"
                />
              )}
            </Field>
            <Field label="Intro blurb">
              {({ id }) => (
                <Textarea
                  id={id}
                  data-guide="Intro blurb"
                  rows={3}
                  value={form.boardIntro ?? ''}
                  onChange={(e) => updateBoard({ boardIntro: e.target.value })}
                  placeholder="FNM every Friday, Prereleases, Commander nights…"
                />
              )}
            </Field>
            <Field label="External calendar URL" hint="Optional link for Google Calendar, Discord events, or your own site.">
              {({ id }) => (
                <Input
                  id={id}
                  type="url"
                  value={form.calendarUrl ?? ''}
                  onChange={(e) => updateBoard({ calendarUrl: e.target.value })}
                  placeholder="https://"
                />
              )}
            </Field>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Events" subtitle="Up to 50 listings. Pinned events stay at the top of the board." />
          <CardBody className="space-y-4">
            <ul className="divide-y divide-border rounded-card border border-border">
              {form.items.length === 0 ? (
                <li className="px-4 py-6 text-center text-sm text-fg-muted">No events yet. Add one below.</li>
              ) : (
                form.items.map((event) => (
                  <li key={event.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                    <div className="min-w-0">
                      <p className="flex items-center gap-2 font-bold text-fg">
                        {event.pinned ? <Pin aria-hidden className="size-3.5 text-amber-600" /> : null}
                        {event.title}
                      </p>
                      <p className="text-xs text-fg-muted">{formatEventDateTime(event.startsAt)}</p>
                    </div>
                    <div className="flex gap-2">
                      <Button type="button" variant="secondary" size="sm" onClick={() => startEdit(event)}>
                        Edit
                      </Button>
                      <Button type="button" variant="ghost" size="sm" onClick={() => removeEvent(event.id)}>
                        <Trash2 aria-hidden className="size-4" />
                        <span className="sr-only">Remove</span>
                      </Button>
                    </div>
                  </li>
                ))
              )}
            </ul>

            <div className="rounded-card border border-dashed border-border bg-bg/50 p-4 space-y-3">
              <p data-guide="Add event" className="text-sm font-bold text-fg">{editingId ? 'Edit event' : 'Add event'}</p>
              <Field label="Title">
                {({ id }) => (
                  <Input
                    id={id}
                    data-guide="Event title"
                    value={draft.title}
                    onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))}
                    placeholder="Friday Night Magic"
                  />
                )}
              </Field>
              <Field label="Starts">
                {({ id }) => (
                  <Input
                    id={id}
                    type="datetime-local"
                    value={isoToDatetimeLocal(draft.startsAt)}
                    onChange={(e) =>
                      setDraft((d) => ({ ...d, startsAt: datetimeLocalToIso(e.target.value) || d.startsAt }))
                    }
                  />
                )}
              </Field>
              <Field label="Location">
                {({ id }) => (
                  <Input
                    id={id}
                    value={draft.location ?? ''}
                    onChange={(e) => setDraft((d) => ({ ...d, location: e.target.value }))}
                    placeholder="Main play area"
                  />
                )}
              </Field>
              <Field label="Description">
                {({ id }) => (
                  <Textarea
                    id={id}
                    rows={2}
                    value={draft.description ?? ''}
                    onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))}
                  />
                )}
              </Field>
              <Field label="Details link">
                {({ id }) => (
                  <Input
                    id={id}
                    type="url"
                    value={draft.externalUrl ?? ''}
                    onChange={(e) => setDraft((d) => ({ ...d, externalUrl: e.target.value }))}
                    placeholder="https://"
                  />
                )}
              </Field>
              <label className="flex items-center gap-2 text-sm text-fg">
                <input
                  type="checkbox"
                  checked={Boolean(draft.pinned)}
                  onChange={(e) => setDraft((d) => ({ ...d, pinned: e.target.checked }))}
                  className="size-4 rounded border-border"
                />
                Pin to top of board
              </label>
              <div className="flex flex-wrap gap-2">
                <Button type="button" data-guide="Add to board" onClick={commitDraft} disabled={!draft.title.trim()}>
                  <Plus aria-hidden className="size-4" />
                  {editingId ? 'Update event' : 'Add to board'}
                </Button>
                {editingId ? (
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => {
                      setEditingId(null)
                      setDraft(emptyDraft())
                    }}
                  >
                    Cancel
                  </Button>
                ) : null}
              </div>
            </div>
          </CardBody>
        </Card>

        <div className="flex flex-wrap items-center gap-3">
          <Button data-guide="Save events & board" onClick={() => saveMutation.mutate()} loading={saveMutation.isPending}>
            <Calendar aria-hidden className="size-4" />
            Save events & board
          </Button>
          {saveMutation.isSuccess && (
            <p className="text-sm font-medium text-success-700" role="status">
              Saved. Storefront calendar updated.
            </p>
          )}
          {errorMessage ? (
            <p className="text-sm font-medium text-danger-700" role="alert">
              {errorMessage}
            </p>
          ) : null}
        </div>
      </div>

      <aside className="space-y-3 xl:sticky xl:top-24 xl:self-start">
        <p className="text-xs font-bold uppercase tracking-wide text-fg-muted">Storefront preview</p>
        <CommunityBoard events={preview} slug={slug} />
      </aside>
    </div>
  )
}
