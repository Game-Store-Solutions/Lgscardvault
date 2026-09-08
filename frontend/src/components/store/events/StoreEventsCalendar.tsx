import { useMemo, useState } from 'react'
import FullCalendar from '@fullcalendar/react'
import dayGridPlugin from '@fullcalendar/daygrid'
import listPlugin from '@fullcalendar/list'
import interactionPlugin from '@fullcalendar/interaction'
import type { EventClickArg, EventInput } from '@fullcalendar/core'
import type { DateClickArg } from '@fullcalendar/interaction'
import { ExternalLink, MapPin, Pin, X } from 'lucide-react'
import type { StoreCommunityEventItem } from '../../../api/types'
import { cx } from '../../../lib/cx'
import { Button, Card, CardBody } from '../../ui'
import { formatEventDateTime, sortedEventItems } from './communityEvents'
import './store-events-calendar.css'

const DEFAULT_DURATION_MS = 2 * 60 * 60 * 1000

function toFullCalendarEvents(items: StoreCommunityEventItem[]): EventInput[] {
  const rows: EventInput[] = []
  for (const item of sortedEventItems(items)) {
    const start = new Date(item.startsAt)
    if (Number.isNaN(start.getTime())) continue
    rows.push({
      id: item.id,
      title: item.title,
      start,
      end: new Date(start.getTime() + DEFAULT_DURATION_MS),
      extendedProps: { storeEvent: item },
      classNames: [
        item.pinned ? 'fc-event-pinned' : '',
        item.imageUrl?.trim() ? 'fc-event-has-image' : '',
      ].filter(Boolean),
    })
  }
  return rows
}

function EventDetailPanel({
  event,
  onClose,
}: {
  event: StoreCommunityEventItem
  onClose: () => void
}) {
  return (
    <Card aria-live="polite">
      <CardBody className="space-y-3">
        {event.imageUrl?.trim() ? (
          <img
            src={event.imageUrl}
            alt=""
            className="max-h-40 w-full rounded-xl object-cover ring-1 ring-border"
          />
        ) : null}
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="flex items-center gap-2 font-display text-lg font-bold text-fg">
              {event.pinned ? <Pin aria-hidden className="size-4 text-amber-600 dark:text-amber-400" /> : null}
              {event.title}
            </p>
            <p className="mt-1 text-sm text-fg-muted">{formatEventDateTime(event.startsAt)}</p>
          </div>
          <Button type="button" variant="ghost" size="sm" onClick={onClose} aria-label="Close event details">
            <X aria-hidden className="size-4" />
          </Button>
        </div>
        {event.location ? (
          <p className="flex items-center gap-2 text-sm text-fg-muted">
            <MapPin aria-hidden className="size-4 shrink-0" />
            {event.location}
          </p>
        ) : null}
        {event.description ? <p className="text-sm leading-relaxed text-fg-muted">{event.description}</p> : null}
        {event.externalUrl ? (
          <a
            href={event.externalUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-sm font-bold text-brand-600 dark:text-brand-300"
          >
            Event details
            <ExternalLink aria-hidden className="size-4" />
          </a>
        ) : null}
      </CardBody>
    </Card>
  )
}

export function StoreEventsCalendar({
  items,
  className,
  onEventSelect,
  onDateSelect,
  showListView = true,
}: {
  items: StoreCommunityEventItem[]
  className?: string
  onEventSelect?: (event: StoreCommunityEventItem) => void
  onDateSelect?: (date: Date) => void
  showListView?: boolean
}) {
  const [selected, setSelected] = useState<StoreCommunityEventItem | null>(null)
  const calendarEvents = useMemo(() => toFullCalendarEvents(items), [items])
  const managed = Boolean(onEventSelect || onDateSelect)

  return (
    <div className={cx('store-events-calendar space-y-4', className)}>
      <div className="rounded-card border border-border bg-surface p-3 shadow-card sm:p-4">
        <FullCalendar
          plugins={[dayGridPlugin, listPlugin, interactionPlugin]}
          initialView="dayGridMonth"
          headerToolbar={{
            left: 'prev,next today',
            center: 'title',
            right: showListView ? 'dayGridMonth,listMonth' : '',
          }}
          buttonText={{
            today: 'Today',
            month: 'Month',
            list: 'List',
          }}
          height="auto"
          events={calendarEvents}
          eventClick={(info: EventClickArg) => {
            info.jsEvent.preventDefault()
            const storeEvent = info.event.extendedProps.storeEvent as StoreCommunityEventItem | undefined
            if (!storeEvent) return
            if (onEventSelect) onEventSelect(storeEvent)
            else setSelected(storeEvent)
          }}
          dateClick={
            onDateSelect
              ? (info: DateClickArg) => {
                  onDateSelect(info.date)
                }
              : undefined
          }
          dayMaxEvents={3}
          navLinks={!onDateSelect}
          nowIndicator
          eventTimeFormat={{
            hour: 'numeric',
            minute: '2-digit',
            meridiem: 'short',
          }}
          eventContent={(arg) => {
            const storeEvent = arg.event.extendedProps.storeEvent as StoreCommunityEventItem | undefined
            const imageUrl = storeEvent?.imageUrl?.trim()
            return (
              <span className="flex min-w-0 items-center gap-1 overflow-hidden">
                {imageUrl ? <img src={imageUrl} alt="" className="fc-event-thumb" /> : null}
                <span className="truncate">
                  {arg.timeText ? `${arg.timeText} ` : ''}
                  {arg.event.title}
                </span>
              </span>
            )
          }}
        />
        {managed ? (
          <p className="mt-3 text-xs text-fg-muted">
            Click a day to add an event. Click an event to edit it.
          </p>
        ) : null}
      </div>
      {!onEventSelect && selected ? <EventDetailPanel event={selected} onClose={() => setSelected(null)} /> : null}
    </div>
  )
}
