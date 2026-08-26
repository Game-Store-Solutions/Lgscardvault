/** Static screenshot fallback when video is unavailable (no live iframe). */
export const MODULE_POSTER: Record<string, string> = {
  'see-your-shop': '/training/storefront-browse.png',
  'take-cards': '/training/payments.png',
  'add-singles': '/training/singles.png',
  'import-csv': '/training/imports.png',
  sealed: '/training/sealed.png',
  cases: '/training/case-cards.png',
  orders: '/training/orders.png',
  'buy-list': '/training/sell-trade.png',
  credit: '/training/store-credit.png',
  branding: '/training/branding.png',
  spotlight: '/training/spotlight.png',
  events: '/training/events.png',
  team: '/training/users.png',
}

export function modulePoster(moduleId: string): string | undefined {
  return MODULE_POSTER[moduleId]
}
