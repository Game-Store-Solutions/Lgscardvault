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
