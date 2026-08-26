import type { MeasuredTarget } from './useLiveTarget'
import { mapTargetToContainerCoords, IFRAME_HEIGHT, IFRAME_WIDTH } from './mapTargetCoords'
import {
  guideKeys,
  isTargetUsablyVisible,
} from './trainingTargetUtils'

export { IFRAME_WIDTH, IFRAME_HEIGHT }

export type TargetResolutionStatus =
  | 'missing'
  | 'ambiguous'
  | 'invalid'
  | 'obscured'
  | 'offscreen'
  | 'validated'

export interface TargetDebugInfo {
  requestedTarget: string
  resolvedKey: string | null
  matchCount: number
  tagName: string | null
  dataGuide: string | null
  accessibleName: string | null
  role: string | null
  visible: boolean
  inViewport: boolean
  obscured: boolean
  domRect: { x: number; y: number; width: number; height: number } | null
  overlayRect: MeasuredTarget | null
  validation: 'PASS' | 'FAIL'
  failureReason: string | null
}

export interface TargetResolution {
  status: TargetResolutionStatus
  key: string | null
  element: HTMLElement | null
  rect: MeasuredTarget | null
  debug: TargetDebugInfo
}

function normalize(value: string | null | undefined): string {
  return (value ?? '').replace(/\s+/g, ' ').trim()
}

/** Iframe nodes fail `instanceof HTMLElement` from the parent realm. */
function isElement(node: unknown): node is HTMLElement {
  return !!node && typeof node === 'object' && (node as Node).nodeType === 1
}

function guideKey(node: HTMLElement): string | null {
  return node.getAttribute('data-guide') ?? node.getAttribute('data-training-target')
}

function accessibleName(node: HTMLElement, root: ParentNode): string {
  const labelled = node.getAttribute('aria-label')
  if (labelled) return normalize(labelled)
  const guide = guideKey(node)
  if (guide) return guide
  if (node.id) {
    try {
      const label = (root as Document | Element).querySelector?.(`label[for="${CSS.escape(node.id)}"]`)
      if (isElement(label)) return normalize(label.textContent)
    } catch {
      /* invalid id */
    }
  }
  const wrap = node.closest('label')
  if (wrap) return normalize(wrap.textContent)
  return normalize(node.textContent)
}

function isVisible(node: HTMLElement): boolean {
  if (!node.isConnected) return false
  const rect = node.getBoundingClientRect()
  if (rect.width < 2 || rect.height < 2) return false
  const view = node.ownerDocument.defaultView
  const style = view?.getComputedStyle(node)
  if (!style) return true
  if (style.visibility === 'hidden' || style.display === 'none' || style.opacity === '0') return false
  // Disabled lesson targets (e.g. Add case before naming) still need spotlight resolution.
  if (style.pointerEvents === 'none' && !guideKey(node)) return false
  return true
}

function inIframeViewport(node: HTMLElement): boolean {
  return isTargetUsablyVisible(node)
}

function isStickyOrFixed(el: Element, view: Window): boolean {
  if (!(el instanceof HTMLElement)) return false
  const style = view.getComputedStyle(el)
  return style.position === 'fixed' || style.position === 'sticky'
}

function isObscured(doc: Document, node: HTMLElement): boolean {
  const rect = node.getBoundingClientRect()
  if (rect.width < 2 || rect.height < 2) return true
  const view = doc.defaultView
  if (!view) return true

  if (
    guideKey(node) &&
    (node.matches(':disabled, [disabled], [aria-disabled="true"]') ||
      view.getComputedStyle(node).pointerEvents === 'none')
  ) {
    return false
  }

  const sampleYs = [
    rect.top + Math.min(12, rect.height * 0.25),
    rect.top + rect.height / 2,
    rect.bottom - Math.min(12, rect.height * 0.25),
  ]
  const cx = rect.left + rect.width / 2

  for (const cy of sampleYs) {
    if (cy < 0 || cy > view.innerHeight) continue
    const topEl = doc.elementFromPoint(cx, cy)
    if (!topEl) continue
    if (topEl === node || node.contains(topEl)) return false
    if (isStickyOrFixed(topEl, view)) {
      const chromeBottom = topEl.getBoundingClientRect().bottom
      if (rect.bottom > chromeBottom + 4) continue
    }
  }

  return true
}

/** Map iframe viewport coordinates → training overlay coordinates (accounts for CSS scale). */
export function measureTargetRect(
  container: HTMLElement,
  iframe: HTMLIFrameElement,
  node: HTMLElement,
): MeasuredTarget | null {
  return mapTargetToContainerCoords(container, iframe, node)
}

function findByGuideKey(root: ParentNode, key: string): HTMLElement[] {
  const matches: HTMLElement[] = []
  const selector = `[data-guide="${CSS.escape(key)}"], [data-training-target="${CSS.escape(key)}"]`
  for (const node of root.querySelectorAll(selector)) {
    if (isElement(node)) matches.push(node)
  }
  return matches
}

function emptyDebug(requestedTarget: string): TargetDebugInfo {
  return {
    requestedTarget,
    resolvedKey: null,
    matchCount: 0,
    tagName: null,
    dataGuide: null,
    accessibleName: null,
    role: null,
    visible: false,
    inViewport: false,
    obscured: false,
    domRect: null,
    overlayRect: null,
    validation: 'FAIL',
    failureReason: null,
  }
}

export interface TargetLookup {
  key: string
  element: HTMLElement
}

/** Find a visible target element without viewport validation — used before scrolling. */
export function lookupTrainingTarget(doc: Document, target: string): TargetLookup | null {
  for (const key of guideKeys(target)) {
    const matches = findByGuideKey(doc, key).filter(isVisible)
    if (matches.length === 1) return { key, element: matches[0]! }
    if (matches.length > 1) return null
  }
  return null
}

/**
 * Resolve a lesson target strictly by semantic id (`data-guide` / `data-training-target`).
 * Never falls back to text, aria-label, or approximate selectors.
 */
export function resolveTrainingTarget(
  doc: Document,
  iframe: HTMLIFrameElement,
  container: HTMLElement,
  target: string,
): TargetResolution {
  const debug = emptyDebug(target)
  const keys = guideKeys(target)

  if (keys.length === 0) {
    debug.failureReason = 'Empty target id'
    return { status: 'missing', key: null, element: null, rect: null, debug }
  }

  for (const key of keys) {
    const matches = findByGuideKey(doc, key).filter(isVisible)
    debug.matchCount = matches.length
    debug.resolvedKey = key

    if (matches.length === 0) continue

    if (matches.length > 1) {
      debug.failureReason = `Ambiguous: ${matches.length} elements with data-guide="${key}"`
      debug.validation = 'FAIL'
      return { status: 'ambiguous', key, element: null, rect: null, debug }
    }

    const element = matches[0]!
    const resolvedGuide = guideKey(element)
    debug.tagName = element.tagName.toLowerCase()
    debug.dataGuide = resolvedGuide
    debug.accessibleName = accessibleName(element, doc)
    debug.role = element.getAttribute('role')
    debug.visible = isVisible(element)

    if (resolvedGuide !== key) {
      debug.failureReason = `Identity mismatch: expected "${key}", got "${resolvedGuide ?? 'none'}"`
      debug.validation = 'FAIL'
      return { status: 'invalid', key, element: null, rect: null, debug }
    }

    if (!debug.visible) {
      debug.failureReason = 'Target is not visible'
      debug.validation = 'FAIL'
      return { status: 'invalid', key, element: null, rect: null, debug }
    }

    const viewportRect = element.getBoundingClientRect()
    debug.domRect = {
      x: viewportRect.x,
      y: viewportRect.y,
      width: viewportRect.width,
      height: viewportRect.height,
    }

    debug.inViewport = inIframeViewport(element)
    if (!debug.inViewport) {
      debug.failureReason = 'Target is outside the visible iframe viewport'
      debug.validation = 'FAIL'
      return { status: 'offscreen', key, element: null, rect: null, debug }
    }

    debug.obscured = isObscured(doc, element)
    if (debug.obscured) {
      debug.failureReason = 'Target center is obscured by another element'
      debug.validation = 'FAIL'
      return { status: 'obscured', key, element: null, rect: null, debug }
    }

    const rect = measureTargetRect(container, iframe, element)
    debug.overlayRect = rect
    if (!rect) {
      debug.failureReason = 'Could not map target bounds to the training overlay'
      debug.validation = 'FAIL'
      return { status: 'invalid', key, element: null, rect: null, debug }
    }

    debug.validation = 'PASS'
    debug.failureReason = null
    return { status: 'validated', key, element, rect, debug }
  }

  debug.resolvedKey = null
  debug.matchCount = 0
  debug.failureReason = `No element with data-guide matching: ${keys.join(' | ')}`
  debug.validation = 'FAIL'
  return { status: 'missing', key: null, element: null, rect: null, debug }
}

/** @deprecated Use resolveTrainingTarget — kept for callers that only need the element. */
export function findGuideNode(root: ParentNode, target: string): HTMLElement | null {
  const doc = root as Document
  const lookup = lookupTrainingTarget(doc, target)
  if (!lookup) return null
  const iframe = doc.defaultView?.frameElement
  if (!(iframe instanceof HTMLIFrameElement)) return null
  const container = iframe.parentElement
  if (!container) return null
  const result = resolveTrainingTarget(doc, iframe, container, target)
  return result.status === 'validated' ? result.element : null
}
