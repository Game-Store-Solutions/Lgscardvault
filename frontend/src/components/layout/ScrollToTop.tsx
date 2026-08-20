import { useEffect } from 'react'
import { useLocation } from 'react-router'

function scrollWindowToTop() {
  window.scrollTo({ top: 0, left: 0, behavior: 'auto' })
  document.documentElement.scrollTop = 0
  document.body.scrollTop = 0
}

/**
 * Every pathname / hash change starts at the top of the document. Query-string
 * updates (storefront filters) must not jump the scroll. Hash links
 * (e.g. /s/:slug#store-search) still jump to that element once it exists.
 */
export function ScrollToTop() {
  const { pathname, hash } = useLocation()

  useEffect(() => {
    const id = hash.startsWith('#') ? decodeURIComponent(hash.slice(1)) : ''
    if (!id) {
      scrollWindowToTop()
      return
    }

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
