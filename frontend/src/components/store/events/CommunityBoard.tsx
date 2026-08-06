import { Calendar, ExternalLink, MapPin, Pin } from 'lucide-react'
import { Link } from 'react-router'
import type { StoreCommunityEvents } from '../../../api/types'
import { cx } from '../../../lib/cx'
import { formatEventDateTime, normalizeCommunityEvents, upcomingEvents } from './communityEvents'

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
  const items = upcomingEvents(data, compact ? 5 : undefined)

  return (
    <div
      className={cx(
        'relative rotate-1 rounded-xl border p-4 shadow-md',
        'border-amber-800/25 bg-amber-50/95',
        'dark:border-amber-500/35 dark:bg-gradient-to-br dark:from-amber-950/75 dark:via-amber-950/55 dark:to-stone-950/80 dark:shadow-black/50',
        className,
      )}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 rounded-xl opacity-[0.07] dark:opacity-[0.12]"
        style={{
          backgroundImage:
            'repeating-linear-gradient(-12deg, transparent, transparent 8px, rgba(120,53,15,0.35) 8px, rgba(120,53,15,0.35) 9px)',
        }}
      />
      <div className="relative">
        <p className="flex items-center gap-2 text-sm font-bold text-fg">
          <Calendar aria-hidden className="size-4 text-amber-700 dark:text-amber-300" />
          {data.boardHeading}
        </p>
        {data.boardIntro ? (
          <p className="mt-1 text-xs leading-relaxed text-fg-muted sm:text-sm">{data.boardIntro}</p>
        ) : null}

        <ul className="mt-3 space-y-2 text-sm">
          {items.length === 0 ? (
            <li className="rounded-lg border border-dashed border-border bg-surface/80 px-3 py-2 text-fg-muted dark:bg-surface/60">
              No upcoming events posted yet.
            </li>
          ) : (
            items.map((event) => (
              <li
                key={event.id}
                className="rounded-lg border border-border/80 bg-surface/90 px-3 py-2 dark:border-white/10 dark:bg-surface/70"
              >
                <div className="flex items-start gap-2">
                  {event.pinned ? (
                    <Pin aria-hidden className="mt-0.5 size-3.5 shrink-0 text-amber-600 dark:text-amber-400" />
                  ) : null}
                  <div className="min-w-0 flex-1">
                    <p className="font-bold text-fg">{event.title}</p>
                    <p className="text-xs text-fg-muted">{formatEventDateTime(event.startsAt)}</p>
                    {event.location ? (
                      <p className="mt-0.5 flex items-center gap-1 text-xs text-fg-muted">
                        <MapPin aria-hidden className="size-3 shrink-0" />
                        {event.location}
                      </p>
                    ) : null}
                    {!compact && event.description ? (
                      <p className="mt-1 text-xs leading-relaxed text-fg-muted">{event.description}</p>
                    ) : null}
                    {event.externalUrl ? (
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
                </div>
              </li>
            ))
          )}
        </ul>

        <div className="mt-3 flex flex-wrap gap-2">
          {slug ? (
            <Link
              to={`/s/${slug}/events`}
              className="text-xs font-bold text-brand-600 underline-offset-2 hover:underline dark:text-brand-300"
            >
              Full event calendar
            </Link>
          ) : null}
          {data.calendarUrl ? (
            <a
              href={data.calendarUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs font-bold text-fg-muted hover:text-fg"
            >
              Subscribe / external calendar
              <ExternalLink aria-hidden className="size-3" />
            </a>
          ) : null}
        </div>
      </div>
    </div>
  )
}
