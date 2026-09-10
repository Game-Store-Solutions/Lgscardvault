import api from '../api/client'
import type { BuylistEntry, CardSummary, SellPayoutMethod } from '../api/types'

const CONDITIONS = ['NM', 'LP', 'MP', 'HP', 'DMG'] as const
export type SellTradeCondition = (typeof CONDITIONS)[number]

/** Persisted sell/trade line — mirrors the in-page list shape. */
export interface SellTradeDraftLine {
  key: string
  card: CardSummary
  entry: BuylistEntry | null
  finish: string
  condition: SellTradeCondition
  quantity: number
}

export interface SellTradeDraft {
  lines: SellTradeDraftLine[]
  payoutMethod: SellPayoutMethod
  kioskCustomerName: string
  gameFilter: string
}

function storageKey(slug: string) {
  return `lgscv-sell-trade:${slug}`
}

function isCondition(value: unknown): value is SellTradeCondition {
  return typeof value === 'string' && (CONDITIONS as readonly string[]).includes(value)
}

function isDraftLine(value: unknown): value is SellTradeDraftLine {
  if (!value || typeof value !== 'object') return false
  const line = value as SellTradeDraftLine
  return (
    typeof line.key === 'string' &&
    Boolean(line.card?.id) &&
    typeof line.card.name === 'string' &&
    typeof line.finish === 'string' &&
    isCondition(line.condition) &&
    typeof line.quantity === 'number' &&
    line.quantity > 0
  )
}

function parseDraft(raw: unknown): SellTradeDraft | null {
  if (!raw || typeof raw !== 'object') return null
  const parsed = raw as Partial<SellTradeDraft>
  if (!Array.isArray(parsed.lines)) return null
  const lines = parsed.lines.filter(isDraftLine)
  const draft: SellTradeDraft = {
    lines,
    payoutMethod: parsed.payoutMethod === 'cash' ? 'cash' : 'credit',
    kioskCustomerName: typeof parsed.kioskCustomerName === 'string' ? parsed.kioskCustomerName : '',
    gameFilter: typeof parsed.gameFilter === 'string' ? parsed.gameFilter : '',
  }
  return isSellTradeDraftEmpty(draft) ? null : draft
}

export function isSellTradeDraftEmpty(draft: SellTradeDraft | null | undefined): boolean {
  if (!draft) return true
  return draft.lines.length === 0 && draft.payoutMethod === 'credit' && !draft.kioskCustomerName.trim()
}

export function loadSellTradeDraft(slug: string): SellTradeDraft | null {
  if (!slug) return null
  try {
    const raw = localStorage.getItem(storageKey(slug))
    if (!raw) return null
    return parseDraft(JSON.parse(raw))
  } catch {
    return null
  }
}

export function saveSellTradeDraft(slug: string, draft: SellTradeDraft): void {
  if (!slug) return
  try {
    if (isSellTradeDraftEmpty(draft)) {
      localStorage.removeItem(storageKey(slug))
      return
    }
    localStorage.setItem(storageKey(slug), JSON.stringify(draft))
  } catch {
    // Private mode / quota — list still works for the current visit.
  }
}

export function clearSellTradeDraft(slug: string): void {
  if (!slug) return
  try {
    localStorage.removeItem(storageKey(slug))
  } catch {
    // ignore
  }
}

/** Load the signed-in shopper's server-backed draft for this store. */
export async function fetchSellTradeDraft(slug: string): Promise<SellTradeDraft | null> {
  const { data } = await api.get<{ draft: SellTradeDraft | null }>(`/stores/${slug}/customer/sell-trade-draft`)
  return parseDraft(data.draft)
}

/** Persist draft to the customer profile (or clear when empty). */
export async function persistSellTradeDraft(
  slug: string,
  draft: SellTradeDraft,
  opts?: { notify?: boolean },
): Promise<SellTradeDraft | null> {
  if (isSellTradeDraftEmpty(draft)) {
    await api.delete(`/stores/${slug}/customer/sell-trade-draft`)
    return null
  }
  const { data } = await api.put<{ draft: SellTradeDraft | null }>(
    `/stores/${slug}/customer/sell-trade-draft`,
    {
      payoutMethod: draft.payoutMethod,
      gameFilter: draft.gameFilter,
      lines: draft.lines.map((line) => ({
        cardId: line.card.id,
        buylistEntryId: line.entry?.id ?? null,
        finish: line.finish,
        condition: line.condition,
        quantity: line.quantity,
      })),
      ...(opts?.notify ? { notify: true } : {}),
    },
    opts?.notify ? { params: { notify: 1 } } : undefined,
  )
  return parseDraft(data.draft)
}

/**
 * Best-effort sync when leaving the page (tab close / SPA navigate).
 * Uses fetch keepalive so the request can outlive the document.
 */
export function flushSellTradeDraftOnLeave(slug: string, draft: SellTradeDraft, token: string | null): void {
  if (!slug || !token || isSellTradeDraftEmpty(draft)) return
  saveSellTradeDraft(slug, draft)
  try {
    const body = JSON.stringify({
      payoutMethod: draft.payoutMethod,
      gameFilter: draft.gameFilter,
      notify: true,
      lines: draft.lines.map((line) => ({
        cardId: line.card.id,
        buylistEntryId: line.entry?.id ?? null,
        finish: line.finish,
        condition: line.condition,
        quantity: line.quantity,
      })),
    })
    void fetch(`/api/stores/${encodeURIComponent(slug)}/customer/sell-trade-draft?notify=1`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body,
      keepalive: true,
      credentials: 'same-origin',
    })
  } catch {
    // ignore — local draft still holds the list
  }
}

export async function deleteSellTradeDraft(slug: string): Promise<void> {
  await api.delete(`/stores/${slug}/customer/sell-trade-draft`)
}
