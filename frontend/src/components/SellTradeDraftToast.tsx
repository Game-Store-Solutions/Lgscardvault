import { useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router'
import { CheckCircle2, X } from 'lucide-react'
import { AnimatePresence, EASE_PREMIUM, motion } from './motion'

type DraftToast = { slug: string; storeName: string; cardCount: number }

const STORAGE_KEY = 'lgs-sell-draft-toast'

/** One-shot banner after leaving Sell/Trade with cards still on the list. */
export function SellTradeDraftToast() {
  const location = useLocation()
  const [toast, setToast] = useState<DraftToast | null>(null)

  useEffect(() => {
    if (/\/s\/[^/]+\/sell\/?$/.test(location.pathname)) return
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY)
      if (!raw) return
      sessionStorage.removeItem(STORAGE_KEY)
      const parsed = JSON.parse(raw) as DraftToast
      if (!parsed?.slug || !parsed.cardCount) return
      setToast(parsed)
    } catch {
      // ignore
    }
  }, [location.pathname])

  useEffect(() => {
    if (!toast) return
    const timer = window.setTimeout(() => setToast(null), 6000)
    return () => window.clearTimeout(timer)
  }, [toast])

  return (
    <AnimatePresence>
      {toast ? (
        <motion.div
          key={`${toast.slug}-${toast.cardCount}`}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0, transition: { duration: 0.28, ease: EASE_PREMIUM } }}
          exit={{ opacity: 0, y: 8, transition: { duration: 0.18 } }}
          className="pointer-events-auto fixed bottom-4 left-4 right-4 z-[60] mx-auto max-w-md sm:left-auto sm:right-6 sm:mx-0"
          role="status"
        >
          <div className="flex items-start gap-3 rounded-btn border border-brand-500/30 bg-surface px-4 py-3 shadow-lg">
            <CheckCircle2 aria-hidden className="mt-0.5 size-5 shrink-0 text-brand-600" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold text-fg">Sell list saved as a draft</p>
              <p className="mt-0.5 text-sm text-fg-muted">
                {toast.cardCount} card{toast.cardCount === 1 ? '' : 's'} at {toast.storeName}. Continue anytime from
                Sell / Trade or your profile.
              </p>
              <Link
                to={`/s/${toast.slug}/sell`}
                className="mt-2 inline-block text-sm font-bold text-brand-600 hover:underline"
                onClick={() => setToast(null)}
              >
                Continue list →
              </Link>
            </div>
            <button
              type="button"
              aria-label="Dismiss"
              onClick={() => setToast(null)}
              className="grid size-8 shrink-0 place-items-center rounded-full text-fg-muted hover:bg-bg hover:text-fg"
            >
              <X className="size-4" aria-hidden />
            </button>
          </div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  )
}
