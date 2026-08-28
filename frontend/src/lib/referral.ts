const REFERRAL_KEY = 'lgscv-referral'

export interface ReferralAttribution {
  source?: string
  medium?: string
  campaign?: string
  storeSlug?: string
  capturedAt: string
}

export function captureReferralFromSearch(search: string): ReferralAttribution | null {
  const params = new URLSearchParams(search)
  const ref = params.get('ref')?.trim()
  const utmSource = params.get('utm_source')?.trim()
  const utmMedium = params.get('utm_medium')?.trim()
  const utmCampaign = params.get('utm_campaign')?.trim()

  if (!ref && !utmSource && !utmMedium && !utmCampaign) return null

  const attribution: ReferralAttribution = {
    source: utmSource ?? (ref ? 'store' : undefined),
    medium: utmMedium ?? (ref ? 'referral' : undefined),
    campaign: utmCampaign,
    storeSlug: ref || undefined,
    capturedAt: new Date().toISOString(),
  }

  try {
    sessionStorage.setItem(REFERRAL_KEY, JSON.stringify(attribution))
  } catch {
    // ignore
  }
  return attribution
}

export function readReferralAttribution(): ReferralAttribution | null {
  try {
    const raw = sessionStorage.getItem(REFERRAL_KEY)
    if (!raw) return null
    return JSON.parse(raw) as ReferralAttribution
  } catch {
    return null
  }
}

export function clearReferralAttribution(): void {
  try {
    sessionStorage.removeItem(REFERRAL_KEY)
  } catch {
    // ignore
  }
}
