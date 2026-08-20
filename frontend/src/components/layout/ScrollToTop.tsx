import { useEffect, useRef } from 'react'
import { useLocation } from 'react-router'

function scrollWindowToTop() {
  window.scrollTo({ top: 0, left: 0, behavior: 'auto' })
  document.documentElement.scrollTop = 0
  document.body.scrollTop = 0
}

/**
 * Pathname changes start at the top of the document. Hash links
 * (e.g. /s/:slug#store-search when returning from a card) jump to that
 * element once it exists.
 *
 * Query-string updates on the same page (storefront color / set filters)
 * must not move the viewport — including when React Router drops or keeps
 * `#store-search` while rewriting `?colors=`.
 */
export function ScrollToTop() {
  const { pathname, hash } = useLocation()
  const previousPathname = useRef<string | null>(null)

  useEffect(() => {
    const pathChanged = previousPathname.current !== pathname
    const firstLoad = previousPathname.current === null
    previousPathname.current = pathname

    const id = hash.startsWith('#') ? decodeURIComponent(hash.slice(1)) : ''
    if (!id) {
      if (pathChanged || firstLoad) scrollWindowToTop()
      return
    }

    // Same-page search-param rewrites can keep this hash; don't re-scroll.
    if (!pathChanged && !firstLoad) return

    const jump = () => {
      const target = document.getElementById(id)
      if (!target) return false
      target.scrollIntoView({ block: 'start' })
      return true
    }

    if (jump()) return

    let tries = 0
    const timer = window.setInterval(() => {
      tries += 1
      if (jump() || tries >= 20) {
        window.clearInterval(timer)
        if (tries >= 20) scrollWindowToTop()
      }
    }, 50)

    return () => window.clearInterval(timer)
  }, [pathname, hash])

  return null
}
