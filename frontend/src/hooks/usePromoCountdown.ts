import { useEffect, useState } from 'react'

function formatCountdown(endsAt: string | null | undefined): string {
  if (!endsAt) return ''
  const distance = new Date(endsAt).getTime() - Date.now()
  if (Number.isNaN(distance) || distance <= 0) return 'ending now'
  const days = Math.floor(distance / 86_400_000)
  const hours = Math.floor((distance % 86_400_000) / 3_600_000)
  const minutes = Math.floor((distance % 3_600_000) / 60_000)
  const seconds = Math.floor((distance % 60_000) / 1000)
  return `${days > 0 ? `${days}d ` : ''}${hours}h ${minutes}m ${seconds}s`
}

/** Live "2d 3h 4m 5s" countdown label. Computed on first render so the line does not pop in after paint. */
export function usePromoCountdown(endsAt: string | null | undefined): string {
  const [label, setLabel] = useState(() => formatCountdown(endsAt))
  useEffect(() => {
    if (!endsAt) {
      setLabel('')
      return
    }
    const tick = () => setLabel(formatCountdown(endsAt))
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [endsAt])
  return label
}

export default usePromoCountdown
