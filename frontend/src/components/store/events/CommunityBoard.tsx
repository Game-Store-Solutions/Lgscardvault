import { ArrowRight, Calendar, ExternalLink, MapPin } from 'lucide-react'
import { Link } from 'react-router'
import type { StoreCommunityEventItem, StoreCommunityEvents } from '../../../api/types'
import { cx } from '../../../lib/cx'
import { eventDateParts, eventsOnNearestDay, normalizeCommunityEvents, upcomingEvents } from './communityEvents'

export function EventMediaChip({
  event,
  upcoming = true,
}: {
  event: Pick<StoreCommunityEventItem, 'startsAt' | 'imageUrl'>
  upcoming?: boolean
}) {
  const date = eventDateParts(event.startsAt)
  const imageUrl = event.imageUrl?.trim()

  if (imageUrl) {
    return (
      <span className="relative grid h-[3.25rem] w-12 shrink-0 overflow-hidden rounded-xl bg-bg shadow-sm ring-1 ring-black/10">
        <img src={imageUrl} alt="" className="absolute inset-0 size-full object-cover" />
        <span className="absolute inset-x-0 bottom-0 bg-black/70 py-0.5 text-center text-[9px] font-bold uppercase leading-none tracking-wide text-white">
          {date.month} {date.day}
        </span>
      </span>
    )
  }

  return (
    <span
      className={cx(
        'grid h-[3.25rem] w-12 shrink-0 place-items-center rounded-xl text-center shadow-sm',
        upcoming ? 'bg-brand-500 text-white' : 'bg-bg text-fg-muted ring-1 ring-border',
      )}
    >
      <span className="text-[10px] font-bold uppercase leading-none tracking-wide">{date.month}</span>
      <span className="font-display text-xl font-bold leading-none">{date.day}</span>
    </span>
  )
}

export function CommunityBoard({
  events,
  compact = false,
  slug,
  className,
}: {
  events?: StoreCommunityEvents | null
  compact?: boolean
  slug?: string
  className?: string
}) {
  const data = normalizeCommunityEvents(events)
  const daySlice = compact ? eventsOnNearestDay(data) : null
  const items = daySlice ? daySlice.items : upcomingEvents(data)
  const moreHint = compact && daySlice
    ? daySlice.hiddenOnDay > 0
      ? `${daySlice.hiddenOnDay} more ${daySlice.isToday ? 'today' : 'that day'}`
      : daySlice.laterCount > 0
        ? `${daySlice.laterCount} more upcoming`
        : null
    : null

  return (
    <div
      className={cx(
        'rounded-card border border-border bg-surface/95 p-4 shadow-card backdrop-blur-sm',
        'dark:border-white/10 dark:bg-surface/90',
        className,
      )}
    >
      <div className="flex items-start gap-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-brand-500/15 text-brand-600 dark:text-brand-300">
          <Calendar aria-hidden className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-display text-base font-bold text-fg">{data.boardHeading}</p>
          {data.boardIntro ? (
            <p className={cx('mt-0.5 text-xs leading-relaxed text-fg-muted sm:text-sm', compact && 'line-clamp-2')}>
              {data.boardIntro}
            </p>
          ) : null}
          {compact && daySlice?.dayLabel && items.length > 0 ? (
            <p className="mt-1 text-[11px] font-bold uppercase tracking-wide text-brand-600 dark:text-brand-300">
              {daySlice.dayLabel}
            </p>
          ) : null}
        </div>
      </div>

      {items.length === 0 ? (
        <div className="mt-4 rounded-xl bg-bg px-3 py-6 text-center ring-1 ring-border/80 dark:ring-white/10">
          <p className="text-sm font-medium text-fg">No upcoming events</p>
          <p className="mt-1 text-xs text-fg-muted">New nights and tournaments will show up here.</p>
        </div>
      ) : (
        <ul className="mt-4 space-y-2">
          {items.map((event) => {
            const date = eventDateParts(event.startsAt)
            return (
              <li
                key={event.id}
                className="flex items-start gap-3 rounded-xl bg-bg px-3 py-2.5 ring-1 ring-border/80 dark:ring-white/10"
              >
                <EventMediaChip event={event} />
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-1.5 font-bold text-fg">
                    <span className="truncate">{event.title}</span>
                    {event.pinned ? (
                      <span className="rounded-full bg-brand-500/15 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-brand-600 dark:text-brand-300">
                        Pinned
                      </span>
                    ) : null}
                  </p>
                  <p className="text-xs text-fg-muted">
                    {date.weekday}
                    {date.time ? ` · ${date.time}` : ''}
                  </p>
                  {event.location ? (
                    <p className="mt-0.5 flex items-center gap-1 text-xs text-fg-muted">
                      <MapPin aria-hidden className="size-3 shrink-0" />
                      {event.location}
                    </p>
                  ) : null}
                  {!compact && event.description ? (
                    <p className="mt-1 text-xs leading-relaxed text-fg-muted">{event.description}</p>
                  ) : null}
                  {!compact && event.externalUrl ? (
                    <a
                      href={event.externalUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-1 inline-flex items-center gap-1 text-xs font-bold text-brand-600 dark:text-brand-300"
                    >
                      Details
                      <ExternalLink aria-hidden className="size-3" />
                    </a>
                  ) : null}
                </div>
              </li>
            )
          })}
        </ul>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1">
        {slug ? (
          <Link
            to={`/s/${slug}/events`}
            className="inline-flex items-center gap-1 text-xs font-bold text-brand-600 hover:underline dark:text-brand-300"
          >
            {moreHint ? `${moreHint} · Full calendar` : 'Full event calendar'}
            <ArrowRight aria-hidden className="size-3" />
          </Link>
        ) : moreHint ? (
          <p className="text-xs font-bold text-fg-muted">{moreHint}</p>
        ) : null}
        {data.calendarUrl ? (
          <a
            href={data.calendarUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-xs font-bold text-fg-muted hover:text-fg"
          >
            Subscribe
            <ExternalLink aria-hidden className="size-3" />
          </a>
        ) : null}
      </div>
    </div>
  )
}
