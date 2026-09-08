/** Read the JWT `exp` claim in milliseconds. Signature is not verified. */
export function readJwtExpiryMs(token: string): number | null {
  try {
    const segment = token.split('.')[1]
    if (!segment) return null
    const padded = segment.replace(/-/g, '+').replace(/_/g, '/')
    const json = JSON.parse(atob(padded.padEnd(Math.ceil(padded.length / 4) * 4, '='))) as { exp?: unknown }
    return typeof json.exp === 'number' ? json.exp * 1000 : null
  } catch {
    return null
  }
}

export function jwtIsExpired(token: string, now = Date.now()): boolean {
  const expiresAt = readJwtExpiryMs(token)
  return expiresAt != null && expiresAt <= now
}
