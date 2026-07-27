import { useEffect, useState } from 'react'

/** Live "2d 3h 4m 5s" countdown label; empty until endsAt is known. */
export function usePromoCountdown(endsAt: string | null | undefined): string {
  const [label, setLabel] = useState('')
  useEffect(() => {
    if (!endsAt) {
      setLabel('')
      return
    }
    const tick = () => {
      const distance = new Date(endsAt).getTime() - Date.now()
      if (distance <= 0) {
        setLabel('ending now')
        return
      }
      const days = Math.floor(distance / 86_400_000)
      const hours = Math.floor((distance % 86_400_000) / 3_600_000)
      const minutes = Math.floor((distance % 3_600_000) / 60_000)
      const seconds = Math.floor((distance % 60_000) / 1000)
      setLabel(`${days > 0 ? `${days}d ` : ''}${hours}h ${minutes}m ${seconds}s`)
    }
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [endsAt])
  return label
}

export default usePromoCountdown
