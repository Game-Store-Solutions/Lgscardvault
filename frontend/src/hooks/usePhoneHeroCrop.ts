import { useEffect, useState } from 'react'

const PHONE_HERO_QUERY = '(max-width: 639px)'

/** True when the viewport is phone-width — used to apply the phone hero crop. */
export function usePhoneHeroCrop(): boolean {
  const [matches, setMatches] = useState(
    () => typeof window !== 'undefined' && window.matchMedia(PHONE_HERO_QUERY).matches,
  )

  useEffect(() => {
    const media = window.matchMedia(PHONE_HERO_QUERY)
    const onChange = () => setMatches(media.matches)
    onChange()
    media.addEventListener('change', onChange)
    return () => media.removeEventListener('change', onChange)
  }, [])

  return matches
}
