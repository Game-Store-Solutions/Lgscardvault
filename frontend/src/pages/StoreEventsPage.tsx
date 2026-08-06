import { ExternalLink } from 'lucide-react'
import { Link, useParams } from 'react-router'
import { useStore, useStoreTheme } from '../hooks'
import { BackButton } from '../components/ui'
import { StorePageLoader } from '../components/store/StorePageLoader'
import { CommunityBoard } from '../components/store/events/CommunityBoard'
import { StoreEventsCalendar } from '../components/store/events/StoreEventsCalendar'
import { normalizeCommunityEvents } from '../components/store/events/communityEvents'

export default function StoreEventsPage() {
  const { slug = '' } = useParams()
  const { data: store, isLoading } = useStore(slug)
  useStoreTheme(store)

  const events = normalizeCommunityEvents(store?.communityEvents)
  const hasItems = events.items.length > 0

  if (isLoading) {
    return <StorePageLoader label="Loading event calendar…" />
  }

  return (
    <div className="space-y-8">
      <div className="space-y-4">
        <BackButton to={`/s/${slug}`}>Back to {store?.name ?? 'store'}</BackButton>
        <div>
          <h1 className="font-display text-3xl font-extrabold tracking-tight text-fg">Event calendar</h1>
          <div className="mt-2 h-1 w-12 rounded-full bg-brand-500" aria-hidden />
          <p className="mt-3 max-w-xl text-sm text-fg-muted">
            Tournaments, drafts, and community nights at {store?.name ?? 'this store'}.
          </p>
        </div>
      </div>

      <CommunityBoard events={events} slug={slug} className="rotate-0 shadow-lg" compact />

      <section className="space-y-3">
        <h2 className="font-display text-lg font-bold text-fg">Schedule</h2>
        {hasItems ? (
          <StoreEventsCalendar items={events.items} />
        ) : (
          <p className="rounded-card border border-dashed border-border bg-surface/80 px-4 py-8 text-center text-sm text-fg-muted">
            No events on the calendar yet. Check back soon or{' '}
            <Link to={`/s/${slug}`} className="font-bold text-brand-600 dark:text-brand-300">
              return to the storefront
            </Link>
            .
          </p>
        )}
      </section>

      {events.calendarUrl ? (
        <p className="text-sm text-fg-muted">
          <a
            href={events.calendarUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 font-bold text-brand-600 hover:underline dark:text-brand-300"
          >
            Subscribe or view external calendar
            <ExternalLink aria-hidden className="size-4" />
          </a>
        </p>
      ) : null}
    </div>
  )
}
