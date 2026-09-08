/** Shared value formatters used across pages. */

/** Localized short date ("Jul 1, 2026"); returns "-" for missing/blank input. */
export function formatDate(value?: string): string {
  if (!value) return '-'
  return new Date(value).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

/** Localized date + time; returns "-" for missing/blank input. */
export function formatDateTime(value?: string): string {
  if (!value) return '-'
  return new Date(value).toLocaleString()
}

/** Short relative time for profile activity ("15 min ago"). */
export function formatRelativeTime(value?: string): string {
  if (!value) return ''
  const then = new Date(value).getTime()
  if (Number.isNaN(then)) return ''
  const minutes = Math.round((Date.now() - then) / 60_000)
  if (minutes < 1) return 'Just now'
  if (minutes < 60) return `${minutes} min ago`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`
  const days = Math.round(hours / 24)
  if (days < 14) return `${days} day${days === 1 ? '' : 's'} ago`
  return formatDate(value)
}
