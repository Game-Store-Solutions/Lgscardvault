import type { StoreCommunityEventItem, StoreCommunityEvents } from '../../../api/types'

export const EMPTY_COMMUNITY_EVENTS: StoreCommunityEvents = {
  boardHeading: 'Community board',
  boardIntro: '',
  calendarUrl: '',
  items: [],
}

export function normalizeCommunityEvents(raw?: StoreCommunityEvents | null): StoreCommunityEvents {
  if (!raw) return { ...EMPTY_COMMUNITY_EVENTS, items: [] }
  return {
    boardHeading: raw.boardHeading?.trim() || EMPTY_COMMUNITY_EVENTS.boardHeading,
    boardIntro: raw.boardIntro?.trim() ?? '',
    calendarUrl: raw.calendarUrl?.trim() ?? '',
    items: Array.isArray(raw.items) ? raw.items : [],
  }
}

export function sortCommunityEvents(events: StoreCommunityEvents): StoreCommunityEvents {
  const items = [...events.items].sort((a, b) => {
    if (a.pinned && !b.pinned) return -1
    if (!a.pinned && b.pinned) return 1
    return new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime()
  })
  return { ...events, items }
}

export function upcomingEvents(events: StoreCommunityEvents, limit?: number): StoreCommunityEventItem[] {
  const now = Date.now()
  const sorted = sortCommunityEvents(events).items.filter((e: StoreCommunityEventItem) => {
    const t = new Date(e.startsAt).getTime()
    return !Number.isNaN(t) && t >= now - 24 * 60 * 60 * 1000
  })
  return limit ? sorted.slice(0, limit) : sorted
}

/** Local calendar day key (`YYYY-MM-DD`) for grouping events without mixing timezones. */
export function localDayKey(isoOrDate: string | Date): string | null {
  const d = typeof isoOrDate === 'string' ? new Date(isoOrDate) : isoOrDate
  if (Number.isNaN(d.getTime())) return null
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export const HERO_DAY_EVENT_CAP = 4

/**
 * Hero/widget slice: events on today if any remain, otherwise the next day
 * that has listings. Caps how many rows the board can grow.
 */
export function eventsOnNearestDay(
  events: StoreCommunityEvents,
  now = new Date(),
  maxItems = HERO_DAY_EVENT_CAP,
): {
  items: StoreCommunityEventItem[]
  dayLabel: string
  isToday: boolean
  hiddenOnDay: number
  laterCount: number
} {
  const todayKey = localDayKey(now)
  const empty = { items: [] as StoreCommunityEventItem[], dayLabel: '', isToday: false, hiddenOnDay: 0, laterCount: 0 }
  if (!todayKey) return empty

  const byDay = new Map<string, StoreCommunityEventItem[]>()
  for (const item of events.items) {
    const key = localDayKey(item.startsAt)
    if (!key || key < todayKey) continue
    const list = byDay.get(key) ?? []
    list.push(item)
    byDay.set(key, list)
  }

  const chosenKey = byDay.has(todayKey) ? todayKey : [...byDay.keys()].sort()[0]
  if (!chosenKey) return empty

  const dayItems = sortCommunityEvents({ ...EMPTY_COMMUNITY_EVENTS, items: byDay.get(chosenKey) ?? [] }).items
  const shown = dayItems.slice(0, maxItems)
  const sample = shown[0] ? new Date(shown[0].startsAt) : now
  const isToday = chosenKey === todayKey

  return {
    items: shown,
    dayLabel: isToday
      ? 'Today'
      : sample.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' }),
    isToday,
    hiddenOnDay: Math.max(0, dayItems.length - shown.length),
    laterCount: Math.max(0, [...byDay.values()].reduce((n, list) => n + list.length, 0) - dayItems.length),
  }
}

export function formatEventDateTime(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

/** Compact date chip for the events widget: month, day number, and start time. */
export function eventDateParts(iso: string): { month: string; day: string; weekday: string; time: string } {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) {
    return { month: '', day: '', weekday: '', time: iso }
  }
  return {
    month: d.toLocaleDateString(undefined, { month: 'short' }),
    day: String(d.getDate()),
    weekday: d.toLocaleDateString(undefined, { weekday: 'short' }),
    time: d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }),
  }
}

export function hasEventsContent(events?: StoreCommunityEvents | null): boolean {
  const n = normalizeCommunityEvents(events)
  return n.items.length > 0 || Boolean(n.calendarUrl)
}

/** Value for `<input type="datetime-local" />` in the user's local timezone. */
export function isoToDatetimeLocal(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function datetimeLocalToIso(value: string): string {
  if (!value.trim()) return ''
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return value.trim()
  return d.toISOString()
}

export function newEventId(): string {
  return crypto.randomUUID?.() ?? `evt-${Date.now().toString(36)}`
}

const DAY_MS = 24 * 60 * 60 * 1000

export function partitionEventsByTime(events: StoreCommunityEvents) {
  const sorted = sortCommunityEvents(events).items
  const cutoff = Date.now() - DAY_MS
  const upcoming: typeof sorted = []
  const past: typeof sorted = []
  for (const item of sorted) {
    const t = new Date(item.startsAt).getTime()
    if (!Number.isNaN(t) && t >= cutoff) upcoming.push(item)
    else past.push(item)
  }
  past.reverse()
  return { upcoming, past }
}

export function sortedEventItems(items: StoreCommunityEventItem[]): StoreCommunityEventItem[] {
  return sortCommunityEvents({ ...EMPTY_COMMUNITY_EVENTS, items }).items
}
