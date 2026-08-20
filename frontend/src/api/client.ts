import axios from 'axios'

const api = axios.create({
  baseURL: '/api',
  headers: {
    Accept: 'application/json',
    'Content-Type': 'application/json',
  },
})

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token')
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

// On 401, drop a stale token so public pages (cart, storefront) keep working as a guest.
// Protected routes send users to login via ProtectedRoute — no global redirect here.
api.interceptors.response.use(
  (response) => response,
  (error: unknown) => {
    if (httpStatus(error) === 401) {
      localStorage.removeItem('token')
    }
    return Promise.reject(error)
  },
)

/** Safely read the HTTP status code off an axios/fetch-style error. */
export function httpStatus(error: unknown): number | undefined {
  if (error && typeof error === 'object' && 'response' in error) {
    const response = (error as { response?: { status?: number } }).response
    return response?.status
  }
  return undefined
}

/**
 * Best-effort human-readable message for a failed request: prefer the API's
 * `detail`/`error` fields, then the error's own message, then the fallback.
 */
export function extractErrorMessage(error: unknown, fallback: string): string {
  const e = error as { response?: { data?: { detail?: string; error?: string } }; message?: string } | null
  return e?.response?.data?.detail ?? e?.response?.data?.error ?? e?.message ?? fallback
}

export default api

/** Customer-facing order list page size (must match backend default unless overridden). */
export const CUSTOMER_ORDERS_PAGE_SIZE = 15

/** Profile activity lists (want list, favorites, notifications, sell/trade, credit). */
export const ACCOUNT_PAGE_SIZE = 20

export function unwrapCollection<T>(data: T[] | { member?: T[]; 'hydra:member'?: T[] }): T[] {
  if (Array.isArray(data)) {
    return data
  }
  if (data && typeof data === 'object') {
    if (Array.isArray(data.member)) {
      return data.member
    }
    if (Array.isArray(data['hydra:member'])) {
      return data['hydra:member']
    }
  }
  return []
}

// `imageUrl` is nullable because the API returns JSON null for cards with no
// art rather than omitting the key; `??` treats both the same way.
export function cardImage(
  card: {
    imageUrl?: string | null
    imageUris?: { png?: string; large?: string; normal?: string; small?: string } | null
    cardFaces?: {
      imageUrl?: string | null
      imageUris?: { png?: string; large?: string; normal?: string; small?: string } | null
    }[]
  },
  opts?: { quality?: 'display' | 'full' },
): string | undefined {
  const hq = opts?.quality === 'full'
  const front = card.cardFaces?.[0]
  return (
    pickImageUri(card.imageUris, hq) ??
    card.imageUrl ??
    pickImageUri(front?.imageUris, hq) ??
    front?.imageUrl ??
    undefined
  )
}

function pickImageUri(
  uris: { png?: string; large?: string; normal?: string; small?: string } | null | undefined,
  hq: boolean,
): string | undefined {
  if (!uris) {
    return undefined
  }
  if (hq) {
    return uris.png ?? uris.large ?? uris.normal ?? uris.small
  }
  return uris.large ?? uris.normal ?? uris.small ?? uris.png
}

export function formatPrice(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`
}

/** Parse a user-entered dollar amount ("$1,234.56") into cents; null if blank/invalid. */
export function parsePriceInput(value: string): number | null {
  if (!value.trim()) return null
  const parsed = Number(value.replace(/[$,\s]/g, ''))
  return Number.isNaN(parsed) ? null : Math.round(parsed * 100)
}

export function parseScryfallPrice(value?: string | null): number | null {
  if (!value) return null
  const parsed = Number(value)
  if (Number.isNaN(parsed) || parsed <= 0) return null
  return Math.round(parsed * 100)
}

export function scryfallPriceCents(
  card: { prices?: { usd?: string | null; usd_foil?: string | null; usd_etched?: string | null } },
  finish: 'nonfoil' | 'foil' | 'etched' = 'nonfoil',
): number | null {
  if (finish === 'foil') {
    return (
      parseScryfallPrice(card.prices?.usd_foil) ??
      parseScryfallPrice(card.prices?.usd_etched) ??
      parseScryfallPrice(card.prices?.usd)
    )
  }
  if (finish === 'etched') {
    return (
      parseScryfallPrice(card.prices?.usd_etched) ??
      parseScryfallPrice(card.prices?.usd_foil) ??
      parseScryfallPrice(card.prices?.usd)
    )
  }
  return (
    parseScryfallPrice(card.prices?.usd) ??
    parseScryfallPrice(card.prices?.usd_etched) ??
    parseScryfallPrice(card.prices?.usd_foil)
  )
}

/** Market price for one finish only — no cross-finish fallback (for accurate PDP tiles). */
export function strictScryfallPriceCents(
  card: { prices?: { usd?: string | null; usd_foil?: string | null; usd_etched?: string | null } },
  finish: 'nonfoil' | 'foil' | 'etched',
): number | null {
  if (finish === 'foil') return parseScryfallPrice(card.prices?.usd_foil)
  if (finish === 'etched') return parseScryfallPrice(card.prices?.usd_etched)
  return parseScryfallPrice(card.prices?.usd)
}

export function formatScryfallPrice(
  card: { prices?: { usd?: string | null; usd_foil?: string | null; usd_etched?: string | null } },
  finish: 'nonfoil' | 'foil' | 'etched' = 'nonfoil',
): string {
  const cents = scryfallPriceCents(card, finish)
  return cents === null ? '-' : formatPrice(cents)
}
