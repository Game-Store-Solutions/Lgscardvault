import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Calendar, ChevronDown, ExternalLink, MapPin, Pin, Plus, Save, Trash2 } from 'lucide-react'
import api, { extractErrorMessage } from '../../api/client'
import type { StoreCommunityEventItem, StoreCommunityEvents } from '../../api/types'
import { useStore } from '../../hooks'
import {
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  Field,
  FilterPill,
  Input,
  Modal,
  Textarea,
} from '../../components/ui'
import { StoreEventsCalendar } from '../../components/store/events/StoreEventsCalendar'
import { EventMediaChip } from '../../components/store/events/CommunityBoard'
import { ImageUploadField } from '../../components/ImageUploadField'
import { cx } from '../../lib/cx'
import {
  datetimeLocalToIso,
  EMPTY_COMMUNITY_EVENTS,
  eventDateParts,
  isoToDatetimeLocal,
  newEventId,
  normalizeCommunityEvents,
  partitionEventsByTime,
  sortCommunityEvents,
} from '../../components/store/events/communityEvents'

const MAX_EVENTS = 50

type EventLane = 'upcoming' | 'past' | 'all'

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
    imageUrl: '',
    pinned: false,
  }
}

function isUpcoming(iso: string): boolean {
  const t = new Date(iso).getTime()
  return !Number.isNaN(t) && t >= Date.now() - 24 * 60 * 60 * 1000
}

export default function EventsTab({ slug }: { slug: string }) {
  const queryClient = useQueryClient()
  const { data: store } = useStore(slug)
  const [form, setForm] = useState<StoreCommunityEvents>({ ...EMPTY_COMMUNITY_EVENTS, items: [] })
  const [draft, setDraft] = useState<StoreCommunityEventItem>(() => emptyDraft())
  const [editingId, setEditingId] = useState<string | null>(null)
  const [composerOpen, setComposerOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [lane, setLane] = useState<EventLane>('upcoming')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  useEffect(() => {
    if (store) {
      setForm(normalizeCommunityEvents(store.communityEvents))
    }
  }, [store])

  const preview = useMemo(() => normalizeCommunityEvents(form), [form])
  const { upcoming, past } = useMemo(() => partitionEventsByTime(form), [form])
  const allItems = useMemo(() => sortCommunityEvents(form).items, [form])
  const visibleItems = lane === 'upcoming' ? upcoming : lane === 'past' ? past : allItems

  const savedSnapshot = JSON.stringify(normalizeCommunityEvents(store?.communityEvents))
  const dirty = JSON.stringify(preview) !== savedSnapshot
  const atCap = form.items.length >= MAX_EVENTS
  const composing = editingId != null

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

  const closeComposer = useCallback(() => {
    setComposerOpen(false)
    setEditingId(null)
    setDraft(emptyDraft())
  }, [])

  function openCreate() {
    setEditingId(null)
    setDraft(emptyDraft())
    setComposerOpen(true)
  }

  function openCreateOnDate(date: Date) {
    const starts = new Date(date)
    if (starts.getHours() === 0 && starts.getMinutes() === 0) {
      starts.setHours(16, 0, 0, 0)
    }
    setEditingId(null)
    setDraft({ ...emptyDraft(), startsAt: starts.toISOString() })
    setComposerOpen(true)
  }

  function startEdit(event: StoreCommunityEventItem) {
    setEditingId(event.id)
    setDraft({ ...event })
    setComposerOpen(true)
  }

  function removeEvent(id: string) {
    setForm((prev) => ({ ...prev, items: prev.items.filter((event) => event.id !== id) }))
    if (editingId === id) closeComposer()
  }

  function togglePin(id: string) {
    setForm((prev) => ({
      ...prev,
      items: prev.items.map((event) => (event.id === id ? { ...event, pinned: !event.pinned } : event)),
    }))
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
      imageUrl: draft.imageUrl?.trim() || undefined,
      pinned: Boolean(draft.pinned),
    }
    setForm((prev) => {
      const exists = prev.items.some((event) => event.id === row.id)
      const items = exists
        ? prev.items.map((event) => (event.id === row.id ? row : event))
        : [...prev.items, row]
      return { ...prev, items }
    })
    closeComposer()
  }

  const emptyCopy =
    form.items.length === 0
      ? {
          title: 'No events on the board',
          description: 'Create Friday Night Magic, prereleases, and commander nights. They appear on the storefront calendar.',
        }
      : lane === 'upcoming'
        ? {
            title: 'Nothing upcoming',
            description: 'Past events are in the Past lane. Create a new night to put it on the storefront.',
          }
        : {
            title: 'No past events',
            description: 'Upcoming listings live in the Upcoming lane.',
          }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 border border-border bg-surface px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-2">
          {(
            [
              { id: 'upcoming', label: 'Upcoming', count: upcoming.length },
              { id: 'past', label: 'Past', count: past.length },
              { id: 'all', label: 'All', count: allItems.length },
            ] as const
          ).map((item) => (
            <FilterPill key={item.id} active={lane === item.id} onClick={() => setLane(item.id)}>
              {item.label}
              <span
                className={cx(
                  'grid h-5 min-w-5 place-items-center rounded-full px-1 text-[10px] font-bold tabular-nums',
                  lane === item.id ? 'bg-white/25 text-white' : 'bg-bg text-fg-muted dark:bg-white/10',
                )}
              >
                {item.count}
              </span>
            </FilterPill>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {dirty ? <Badge tone="warning">Unsaved</Badge> : null}
          <Link
            to={`/s/${slug}/events`}
            className="inline-flex items-center gap-1 text-xs font-bold text-brand-600 hover:underline dark:text-brand-300"
          >
            Open page
            <ExternalLink aria-hidden className="size-3" />
          </Link>
          <Button variant="secondary" size="sm" onClick={openCreate} disabled={atCap}>
            <Plus aria-hidden className="size-4" />
            Create event
          </Button>
          <Button size="sm" onClick={() => saveMutation.mutate()} loading={saveMutation.isPending} disabled={!dirty}>
            <Save aria-hidden className="size-4" />
            Save
          </Button>
        </div>
      </div>

      {errorMessage ? (
        <p role="alert" className="text-sm font-medium text-danger-700">
          {errorMessage}
        </p>
      ) : null}
      {saveMutation.isSuccess && !dirty ? (
        <p className="text-sm font-medium text-success-700" role="status">
          Saved. The storefront calendar is up to date.
        </p>
      ) : null}

      <StoreEventsCalendar
        items={form.items}
        onEventSelect={startEdit}
        onDateSelect={atCap ? undefined : openCreateOnDate}
        showListView={false}
      />

      <Card flat animateIn={false}>
        <CardHeader
          title="Schedule"
          subtitle={`${form.items.length} of ${MAX_EVENTS} events. Pinned nights stay at the top of Upcoming.`}
        />
        {visibleItems.length === 0 ? (
          <EmptyState
            icon={Calendar}
            title={emptyCopy.title}
            description={emptyCopy.description}
            action={
              form.items.length === 0 ? (
                <Button size="sm" onClick={openCreate}>
                  <Plus aria-hidden className="size-4" />
                  Create event
                </Button>
              ) : undefined
            }
          />
        ) : (
          <ul className="divide-y divide-border">
            {visibleItems.map((event) => (
              <EventRow
                key={event.id}
                event={event}
                onOpen={() => startEdit(event)}
                onPin={() => togglePin(event.id)}
                onRemove={() => removeEvent(event.id)}
              />
            ))}
          </ul>
        )}
      </Card>

      <Card flat animateIn={false}>
        <button
          type="button"
          aria-expanded={settingsOpen}
          onClick={() => setSettingsOpen((open) => !open)}
          className="flex w-full items-center gap-3 px-5 py-4 text-left"
        >
          <ChevronDown
            aria-hidden
            className={cx('size-5 shrink-0 text-fg-muted transition-transform', settingsOpen ? 'rotate-0' : '-rotate-90')}
          />
          <span className="min-w-0 flex-1">
            <span className="block font-display text-base font-bold text-fg">Board copy</span>
            <span className="mt-0.5 block text-sm text-fg-muted">
              Heading, intro, and optional calendar link on the public events page.
            </span>
          </span>
        </button>
        {settingsOpen ? (
          <CardBody className="space-y-4 border-t border-border">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Board heading">
                {({ id }) => (
                  <Input
                    id={id}
                    value={form.boardHeading ?? ''}
                    onChange={(e) => updateBoard({ boardHeading: e.target.value })}
                    placeholder="Community board"
                  />
                )}
              </Field>
              <Field label="External calendar URL" hint="Google Calendar, Discord, or your own site.">
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
            </div>
            <Field label="Intro blurb">
              {({ id }) => (
                <Textarea
                  id={id}
                  rows={3}
                  value={form.boardIntro ?? ''}
                  onChange={(e) => updateBoard({ boardIntro: e.target.value })}
                  placeholder="FNM every Friday, Prereleases, Commander nights…"
                />
              )}
            </Field>
          </CardBody>
        ) : null}
      </Card>

      <Modal
        open={composerOpen}
        onClose={closeComposer}
        title={composing ? 'Edit event' : 'Create event'}
        className="max-w-xl"
        footer={
          <>
            <Button variant="secondary" onClick={closeComposer}>
              Cancel
            </Button>
            <Button onClick={commitDraft} disabled={!draft.title.trim()}>
              {composing ? 'Save event' : 'Add to board'}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label="Title">
            {({ id }) => (
              <Input
                id={id}
                value={draft.title}
                onChange={(e) => setDraft((current) => ({ ...current, title: e.target.value }))}
                placeholder="Friday Night Magic"
                autoFocus
              />
            )}
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Starts">
              {({ id }) => (
                <Input
                  id={id}
                  type="datetime-local"
                  value={isoToDatetimeLocal(draft.startsAt)}
                  onChange={(e) =>
                    setDraft((current) => ({
                      ...current,
                      startsAt: datetimeLocalToIso(e.target.value) || current.startsAt,
                    }))
                  }
                />
              )}
            </Field>
            <Field label="Location">
              {({ id }) => (
                <Input
                  id={id}
                  value={draft.location ?? ''}
                  onChange={(e) => setDraft((current) => ({ ...current, location: e.target.value }))}
                  placeholder="Main play area"
                />
              )}
            </Field>
          </div>
          <Field label="Description">
            {({ id }) => (
              <Textarea
                id={id}
                rows={3}
                value={draft.description ?? ''}
                onChange={(e) => setDraft((current) => ({ ...current, description: e.target.value }))}
                placeholder="Format, entry fee, what to bring…"
              />
            )}
          </Field>
          <Field label="Details link">
            {({ id }) => (
              <Input
                id={id}
                type="url"
                value={draft.externalUrl ?? ''}
                onChange={(e) => setDraft((current) => ({ ...current, externalUrl: e.target.value }))}
                placeholder="https://"
              />
            )}
          </Field>
          <ImageUploadField
            label="Event image"
            value={draft.imageUrl ?? ''}
            onChange={(url) => setDraft((current) => ({ ...current, imageUrl: url }))}
            placeholder="https:// or upload a poster"
            hint="Shows on the calendar and the storefront community board."
          />
          <label className="flex items-center gap-2 text-sm font-medium text-fg">
            <input
              type="checkbox"
              checked={Boolean(draft.pinned)}
              onChange={(e) => setDraft((current) => ({ ...current, pinned: e.target.checked }))}
              className="size-4 rounded border-border accent-current"
            />
            Pin to top of the board
          </label>
        </div>
      </Modal>
    </div>
  )
}

function EventRow({
  event,
  onOpen,
  onPin,
  onRemove,
}: {
  event: StoreCommunityEventItem
  onOpen: () => void
  onPin: () => void
  onRemove: () => void
}) {
  const date = eventDateParts(event.startsAt)
  const upcoming = isUpcoming(event.startsAt)

  return (
    <li
      className={cx(
        'flex items-center gap-3 border-l-[3px] px-4 py-3 transition-colors hover:bg-bg/80',
        upcoming ? 'border-l-brand-500' : 'border-l-border',
      )}
    >
      <button
        type="button"
        onClick={onOpen}
        className="flex min-w-0 flex-1 items-center gap-3 text-left"
      >
        <EventMediaChip event={event} upcoming={upcoming} />
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-2">
            <span className="truncate font-bold text-fg">{event.title}</span>
            {event.pinned ? <Badge tone="brand">Pinned</Badge> : null}
            {!upcoming ? <Badge>Past</Badge> : null}
          </span>
          <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-fg-muted">
            <span>
              {date.weekday}
              {date.time ? ` · ${date.time}` : ''}
            </span>
            {event.location ? (
              <span className="inline-flex items-center gap-1">
                <MapPin aria-hidden className="size-3" />
                {event.location}
              </span>
            ) : null}
          </span>
        </span>
      </button>
      <div className="flex shrink-0 items-center gap-1">
        <button
          type="button"
          onClick={onPin}
          aria-pressed={event.pinned}
          aria-label={event.pinned ? `Unpin ${event.title}` : `Pin ${event.title}`}
          className={cx(
            'grid size-9 place-items-center rounded-lg transition-colors',
            event.pinned ? 'text-brand-600 hover:bg-brand-500/10' : 'text-fg-muted hover:bg-bg hover:text-fg',
          )}
        >
          <Pin aria-hidden className="size-4" />
        </button>
        <Button type="button" variant="ghost" size="sm" onClick={onOpen}>
          Edit
        </Button>
        <button
          type="button"
          onClick={onRemove}
          aria-label={`Remove ${event.title}`}
          className="grid size-9 place-items-center rounded-lg text-fg-muted transition-colors hover:bg-bg hover:text-danger-700"
        >
          <Trash2 aria-hidden className="size-4" />
        </button>
      </div>
    </li>
  )
}
