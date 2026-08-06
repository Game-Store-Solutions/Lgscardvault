import { useEffect, useState } from 'react'
import { payments as loadPayments } from '@square/web-sdk'
import type { Payments } from '@square/web-sdk'

/**
 * Loads the Square Web Payments SDK once per application/location pair.
 *
 * The loader injects Square's script tag, so the promise is cached by the SDK
 * itself; re-renders are cheap and StrictMode's double-invoke is harmless.
 */
export function useSquarePayments(applicationId: string, locationId: string, environment?: string) {
  const [payments, setPayments] = useState<Payments | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!applicationId || !locationId) {
      setLoading(false)
      return
    }

    let cancelled = false
    setLoading(true)
    setError('')

    const scriptSrc =
      environment === 'production'
        ? undefined
        : 'https://sandbox.web.squarecdn.com/v1/square.js'

    void loadPayments(applicationId, locationId, scriptSrc ? { scriptSrc } : undefined)
      .then((instance) => {
        if (cancelled) return
        if (!instance) {
          setError('Square payments are unavailable in this browser.')
        }
        setPayments(instance)
      })
      .catch((err: unknown) => {
        if (cancelled) return
        setError(err instanceof Error ? err.message : 'Could not load the payment form.')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [applicationId, locationId, environment])

  return { payments, loading, error }
}
