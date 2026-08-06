import { useMemo, useState } from 'react'
import FullCalendar from '@fullcalendar/react'
import dayGridPlugin from '@fullcalendar/daygrid'
import listPlugin from '@fullcalendar/list'
import interactionPlugin from '@fullcalendar/interaction'
import type { EventClickArg, EventInput } from '@fullcalendar/core'
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
      classNames: item.pinned ? ['fc-event-pinned'] : undefined,
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
}: {
  items: StoreCommunityEventItem[]
  className?: string
}) {
  const [selected, setSelected] = useState<StoreCommunityEventItem | null>(null)
  const calendarEvents = useMemo(() => toFullCalendarEvents(items), [items])

  return (
    <div className={cx('store-events-calendar space-y-4', className)}>
      <div className="rounded-card border border-border bg-surface p-3 shadow-card sm:p-4">
        <FullCalendar
          plugins={[dayGridPlugin, listPlugin, interactionPlugin]}
          initialView="dayGridMonth"
          headerToolbar={{
            left: 'prev,next today',
            center: 'title',
            right: 'dayGridMonth,listMonth',
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
            if (storeEvent) setSelected(storeEvent)
          }}
          dayMaxEvents={3}
          navLinks
          nowIndicator
          eventTimeFormat={{
            hour: 'numeric',
            minute: '2-digit',
            meridiem: 'short',
          }}
        />
      </div>
      {selected ? <EventDetailPanel event={selected} onClose={() => setSelected(null)} /> : null}
    </div>
  )
}
