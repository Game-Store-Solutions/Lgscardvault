/** Shared helpers for semantic training targets inside the live iframe. */

export function findGuideElement(root: ParentNode, target: string): HTMLElement | null {
  for (const key of target.split('|').map((part) => part.trim()).filter(Boolean)) {
    try {
      const selector = `[data-guide="${CSS.escape(key)}"], [data-training-target="${CSS.escape(key)}"]`
      const node = root.querySelector(selector)
      if (node instanceof HTMLElement) return node
    } catch {
      /* invalid key */
    }
  }
  return null
}

export function guideKeys(target: string): string[] {
  return target.split('|').map((part) => part.trim()).filter(Boolean)
}

const VIEWPORT_MARGIN = 24
const STICKY_HEADER_CLEARANCE = 72
const MIN_VISIBLE_PX = 48

/** True when the target center sits inside the iframe viewport with margin. */
export function isTargetCenterInViewport(node: HTMLElement, margin = VIEWPORT_MARGIN): boolean {
  const rect = node.getBoundingClientRect()
  const view = node.ownerDocument.defaultView
  if (!view) return false
  const cx = rect.left + rect.width / 2
  const cy = rect.top + rect.height / 2
  return (
    cx >= margin &&
    cx <= view.innerWidth - margin &&
    cy >= margin &&
    cy <= view.innerHeight - margin
  )
}

/** True when enough of the target is visible to teach (works for tall panels). */
export function isTargetUsablyVisible(node: HTMLElement, margin = VIEWPORT_MARGIN): boolean {
  const rect = node.getBoundingClientRect()
  const view = node.ownerDocument.defaultView
  if (!view) return false
  const inTopChrome = rect.top < STICKY_HEADER_CLEARANCE && rect.height <= 96
  const top = inTopChrome ? Math.max(rect.top, margin) : Math.max(rect.top, STICKY_HEADER_CLEARANCE)
  const bottom = Math.min(rect.bottom, view.innerHeight - margin)
  const left = Math.max(rect.left, margin)
  const right = Math.min(rect.right, view.innerWidth - margin)
  const visibleHeight = bottom - top
  const visibleWidth = right - left
  if (visibleWidth < Math.min(MIN_VISIBLE_PX, rect.width * 0.85)) return false
  const minHeight = Math.min(MIN_VISIBLE_PX, rect.height * 0.35)
  return visibleHeight >= minHeight
}

/** Enable scrolling inside the training iframe document. */
export function ensureTrainingScroll(doc: Document): void {
  const html = doc.documentElement
  const body = doc.body
  // Keep the viewport at iframe height; body grows with content. `height: auto` on html
  // expands the root to full document height and breaks programmatic scroll in iframes.
  html.style.setProperty('overflow-y', 'auto', 'important')
  html.style.setProperty('height', '100%', 'important')
  html.style.removeProperty('max-height')
  body.style.setProperty('overflow-y', 'visible', 'important')
  body.style.setProperty('min-height', '100%', 'important')
  body.style.removeProperty('height')
}

function scrollableAncestors(doc: Document, target: HTMLElement): HTMLElement[] {
  const view = doc.defaultView
  if (!view) return []
  const nodes: HTMLElement[] = []
  let parent: HTMLElement | null = target.parentElement
  while (parent) {
    const style = view.getComputedStyle(parent)
    const scrollableY =
      /auto|scroll|overlay/.test(style.overflowY) && parent.scrollHeight > parent.clientHeight + 1
    const scrollableX =
      /auto|scroll|overlay/.test(style.overflowX) && parent.scrollWidth > parent.clientWidth + 1
    if (scrollableY || scrollableX) nodes.push(parent)
    parent = parent.parentElement
  }
  const main = doc.getElementById('main-content')
  if (main instanceof HTMLElement && !nodes.includes(main)) nodes.push(main)
  return nodes
}

function scrollWindowToReveal(doc: Document, target: HTMLElement): void {
  const view = doc.defaultView
  if (!view) return

  const style = view.getComputedStyle(target)
  const scrollMarginTop = Number.parseFloat(style.scrollMarginTop) || 0
  const desiredTop = STICKY_HEADER_CLEARANCE + scrollMarginTop + VIEWPORT_MARGIN
  const rect = target.getBoundingClientRect()
  const delta = rect.top - desiredTop
  if (Math.abs(delta) <= 2) return

  const scrollingEl = doc.scrollingElement ?? doc.documentElement
  const maxScroll = Math.max(0, scrollingEl.scrollHeight - scrollingEl.clientHeight)
  const next = Math.max(0, Math.min(scrollingEl.scrollTop + delta, maxScroll))
  scrollingEl.scrollTop = next
  view.scrollTo({ top: next, left: 0, behavior: 'auto' })
}

/** Scroll window and scrollable ancestors until the target is usably visible. */
export function bringTargetIntoView(doc: Document, target: HTMLElement): void {
  const view = doc.defaultView
  if (!view) return

  ensureTrainingScroll(doc)
  view.focus?.()

  for (let pass = 0; pass < 12; pass++) {
    if (isTargetUsablyVisible(target, VIEWPORT_MARGIN) || isTargetCenterInViewport(target, VIEWPORT_MARGIN)) {
      break
    }

    scrollWindowToReveal(doc, target)
    target.scrollIntoView({ block: 'start', inline: 'nearest', behavior: 'auto' })

    for (const parent of scrollableAncestors(doc, target)) {
      const parentRect = parent.getBoundingClientRect()
      const targetRect = target.getBoundingClientRect()
      const deltaY = targetRect.top + targetRect.height / 2 - (parentRect.top + parentRect.height / 2)
      if (Math.abs(deltaY) > 2) parent.scrollTop += deltaY
    }

    scrollWindowToReveal(doc, target)
  }

  view.dispatchEvent(new Event('scroll'))
  view.dispatchEvent(new Event('resize'))
}

export function waitForLayoutSettle(ms = 320): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        window.setTimeout(resolve, ms)
      })
    })
  })
}
