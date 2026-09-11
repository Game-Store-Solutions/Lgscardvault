import axios from 'axios'
import { announceSessionExpired } from '../lib/sessionExpiry'
import { jwtIsExpired } from '../lib/jwtExpiry'
import { isKioskModeActive } from '../lib/kioskMode'

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
    if (jwtIsExpired(token)) {
      // Stash before remove so "Still here?" can renew without a password.
      if (!isKioskModeActive()) {
        announceSessionExpired(token)
      }
      localStorage.removeItem('token')
    } else {
      config.headers.Authorization = `Bearer ${token}`
    }
  }
  // Instance default is application/json. FormData must let the browser set
  // multipart/form-data with a boundary, or PHP never sees the uploaded file.
  if (typeof FormData !== 'undefined' && config.data instanceof FormData) {
    const headers = config.headers
    if (headers && typeof headers.delete === 'function') {
      headers.delete('Content-Type')
    } else if (headers) {
      delete (headers as { 'Content-Type'?: string })['Content-Type']
    }
  }

  // Defense in depth: while a terminal is in kiosk mode, never send store-admin
  // or platform-admin mutations even if a staff JWT somehow remains.
  if (isKioskModeActive() && isKioskBlockedAdminRequest(config.method, config.url)) {
    return Promise.reject(
      Object.assign(new Error('Admin actions are disabled in kiosk mode.'), {
        code: 'KIOSK_ADMIN_BLOCKED',
        config,
        isAxiosError: true,
      }),
    )
  }

  return config
})

/** Store / platform management paths that must never run from a kiosk terminal. */
function isKioskBlockedAdminRequest(method?: string, url?: string): boolean {
  const verb = (method ?? 'get').toLowerCase()
  if (verb === 'get' || verb === 'head' || verb === 'options') return false
  const path = (url ?? '').split('?')[0]
  if (!path) return false
  if (/^\/?admin(?:\/|$)/.test(path)) return true
  if (/\/stores\/[^/]+\/(?:sections|cases|imports|settings|team|reports|credit)(?:\/|$)/.test(path)) return true
  if (/\/stores\/[^/]+\/inventory(?:\/|$)/.test(path) && verb !== 'get') return true
  if (/\/stores\/[^/]+\/admin(?:\/|$)/.test(path)) return true
  return false
}

// Expired JWTs used to keep hitting the API and surface as generic failures.
// Drop the token and tell Auth to prompt before signing out — except on a
// kiosk terminal, where the session quietly becomes a guest shopper.
api.interceptors.response.use(
  (response) => response,
  (error: unknown) => {
    const status = httpStatus(error)
    const url = axiosRequestUrl(error)
    const isCredentialRequest = /\/login(?:\?|$)|\/register(?:\?|$)|\/auth\//.test(url)
    if (!isCredentialRequest && shouldPromptSessionExpiry(status, error)) {
      const expired =
        localStorage.getItem('token') ?? authorizationBearer(error)
      if (!isKioskModeActive()) {
        announceSessionExpired(expired)
      }
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

function axiosRequestUrl(error: unknown): string {
  if (error && typeof error === 'object' && 'config' in error) {
    const config = (error as { config?: { url?: string } }).config
    return config?.url ?? ''
  }
  return ''
}

function authorizationBearer(error: unknown): string | null {
  if (!error || typeof error !== 'object' || !('config' in error)) return null
  const headers = (error as { config?: { headers?: unknown } }).config?.headers
  if (!headers || typeof headers !== 'object') return null

  let raw: unknown
  if ('get' in headers && typeof headers.get === 'function') {
    raw = headers.get('Authorization') ?? headers.get('authorization')
  } else {
    const record = headers as Record<string, unknown>
    raw = record.Authorization ?? record.authorization
  }
  if (typeof raw !== 'string') return null
  const match = raw.match(/^Bearer\s+(\S+)/i)
  return match?.[1] ?? null
}

function shouldPromptSessionExpiry(status: number | undefined, error: unknown): boolean {
  if (status === 401) {
    return Boolean(localStorage.getItem('token') || authorizationBearer(error))
  }
  // Expired JWTs sometimes surface as 500s instead of 401s depending on the
  // authenticator. Only treat those as a session expiry when the request
  // actually carried an expired Bearer token.
  if (status === 500) {
    const bearer = authorizationBearer(error)
    const stored = localStorage.getItem('token')
    return Boolean((bearer && jwtIsExpired(bearer)) || (stored && jwtIsExpired(stored)))
  }
  return false
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

/** Compact activity feed on the profile overview. */
export const PROFILE_ACTIVITY_PAGE_SIZE = 8

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

export type CardImageSource = Parameters<typeof cardImage>[0]

/** Resolved catalog art URL; empty string lets CardImage render its placeholder. */
export function cardImageUrl(
  card: CardImageSource,
  opts?: Parameters<typeof cardImage>[1],
): string {
  return cardImage(card, opts) ?? ''
}

/**
 * Fast first paint + sharp display: use `normal` as `src` (1x), and offer
 * `large` as the 2x candidate so retina tiles look sharp without forcing PNG
 * or a large download on every 1x thumbnail.
 */
export function cardArtDelivery(imageUrl: string): { src: string; srcSet?: string } {
  const base = imageUrl.split('#')[0] ?? imageUrl
  if (!base.includes('cards.scryfall.io')) {
    return { src: base }
  }
  const normal = scryfallSize(base, 'normal')
  const large = scryfallSize(base, 'large')
  if (normal === large) {
    return { src: normal }
  }
  return {
    src: normal,
    srcSet: `${normal} 1x, ${large} 2x`,
  }
}

function scryfallSize(url: string, size: 'small' | 'normal' | 'large'): string {
  return url.replace(/cards\.scryfall\.io\/(?:small|normal|large|png)\//, `cards.scryfall.io/${size}/`)
}

/** Catalog fallback when our DB has no art URL for a card name. */
export function scryfallNamedImageUrl(cardName: string): string {
  const face = cardName.includes(' // ') ? cardName.split(' // ')[0]! : cardName
  const params = new URLSearchParams({
    exact: face.trim(),
    format: 'image',
    version: 'normal',
  })
  return `https://api.scryfall.com/cards/named?${params}`
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
  // Prefer large for callers that only pass a single URL; progressive
  // `cardArtDelivery` downgrades the <img src> to normal + srcSet.
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
