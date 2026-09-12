import { useSearchParams } from 'react-router'

/**
 * Keep the current query string when linking to another public path.
 * Paid landings arrive with UTMs; those must survive the apply CTA.
 */
export function usePreservedHref(path: string): string {
  const [params] = useSearchParams()
  const qs = params.toString()
  return qs ? `${path}?${qs}` : path
}
