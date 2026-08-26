import { ensureTrainingScroll, guideKeys } from './trainingTargetUtils'
import type { TrainingInteractionMode } from './trainingInteraction'

/** Guide targets that must never fire real side effects during a training walkthrough. */
const BLOCKED_GUIDE_TARGETS = new Set([
  'Connect Square',
  'Reconnect',
  'Save spotlight',
  'Save events & board',
  'Save events',
  'Import',
  'Add',
  'Add to board',
  'Mark delivered',
  'Accept order',
  'Ready for pickup',
])

function guideKeyForNode(node: EventTarget | null): string | null {
  if (!node || !(node instanceof Element)) return null
  const el = node.closest('[data-guide], [data-training-target]')
  if (!el) return null
  return el.getAttribute('data-guide') ?? el.getAttribute('data-training-target')
}

export const TRAINING_PREPARE_ATTR = 'data-training-prepare'

export function setTrainingPrepareActive(doc: Document, active: boolean): void {
  if (active) doc.documentElement.setAttribute(TRAINING_PREPARE_ATTR, '1')
  else doc.documentElement.removeAttribute(TRAINING_PREPARE_ATTR)
}

export function isTrainingPrepareActive(doc: Document): boolean {
  return doc.documentElement.getAttribute(TRAINING_PREPARE_ATTR) === '1'
}

export interface TrainingInteractionOptions {
  mode: TrainingInteractionMode
  allowedKeys: string[]
  onAllowedTargetClick?: () => void
}

/**
 * Locks unrelated iframe UI during guided lessons without a full-screen overlay.
 * The current beat target (and its children) remain clickable in target-only mode.
 */
export function attachTrainingInteraction(
  doc: Document,
  { mode, allowedKeys, onAllowedTargetClick }: TrainingInteractionOptions,
): () => void {
  ensureTrainingScroll(doc)

  const style = doc.createElement('style')
  style.textContent = `
    html { overflow-y: auto !important; height: 100% !important; }
    body { overflow-y: visible !important; min-height: 100% !important; }
    [data-guide], [data-training-target] {
      scroll-margin-top: 5rem;
      scroll-margin-bottom: 1.5rem;
    }
    body.training-guided-locked a[href]:not([data-training-allowed]),
    body.training-guided-locked button:not([data-training-allowed]),
    body.training-guided-target-only a[href]:not([data-training-allowed]),
    body.training-guided-target-only button:not([data-training-allowed]) {
      pointer-events: auto;
    }
  `
  doc.head?.appendChild(style)
  const bodyClass =
    mode === 'free'
      ? 'training-guided-free'
      : mode === 'target-only'
        ? 'training-guided-target-only'
        : 'training-guided-locked'
  doc.body?.classList.add(bodyClass)

  const win = doc.defaultView
  const historyRestore: (() => void) | null =
    win && mode !== 'free'
      ? (() => {
          const pushState = win.history.pushState.bind(win.history)
          const replaceState = win.history.replaceState.bind(win.history)
          const guard = (native: typeof pushState) =>
            function (this: History, ...args: Parameters<typeof pushState>) {
              if (isTrainingPrepareActive(doc)) return native.apply(this, args)
              return undefined
            }
          win.history.pushState = guard(pushState) as History['pushState']
          win.history.replaceState = guard(replaceState) as History['replaceState']
          return () => {
            win.history.pushState = pushState
            win.history.replaceState = replaceState
          }
        })()
      : null

  const isAllowedKey = (key: string | null): boolean =>
    key != null && allowedKeys.some((k) => guideKeys(k).includes(key))

  const markAllowedTargets = () => {
    doc.querySelectorAll('[data-training-allowed]').forEach((node) => {
      if (node instanceof HTMLElement) node.removeAttribute('data-training-allowed')
    })
    if (mode === 'free') return
    for (const key of allowedKeys) {
      for (const part of guideKeys(key)) {
        for (const el of doc.querySelectorAll(`[data-guide="${CSS.escape(part)}"], [data-training-target="${CSS.escape(part)}"]`)) {
          if (el instanceof HTMLElement) el.setAttribute('data-training-allowed', '1')
        }
      }
    }
  }
  markAllowedTargets()

  const blockIfNeeded = (event: Event) => {
    if (isTrainingPrepareActive(doc)) return
    if (mode === 'free') return
    const key = guideKeyForNode(event.target)

    if (key && BLOCKED_GUIDE_TARGETS.has(key)) {
      event.preventDefault()
      event.stopPropagation()
      event.stopImmediatePropagation()
      return
    }

    const allowed = isAllowedKey(key)

    if (mode === 'target-only') {
      if (allowed) {
        if (event.type === 'click') onAllowedTargetClick?.()
        return
      }
    } else if (mode === 'locked' && allowed) {
      return
    }

    const el = event.target instanceof Element ? event.target : null
    const anchor = el?.closest('a[href]')
    if (anchor) {
      event.preventDefault()
      event.stopPropagation()
      event.stopImmediatePropagation()
      return
    }

    const interactive = el?.closest(
      'button, input, select, textarea, label, [role="button"], [role="link"], [role="tab"], [contenteditable="true"]',
    )
    if (interactive) {
      event.preventDefault()
      event.stopPropagation()
      event.stopImmediatePropagation()
    }
  }

  const onClick = (event: Event) => blockIfNeeded(event)
  const onPointerDown = (event: Event) => blockIfNeeded(event)

  const onSubmit = (event: Event) => {
    event.preventDefault()
    event.stopPropagation()
    event.stopImmediatePropagation()
  }

  doc.addEventListener('click', onClick, true)
  doc.addEventListener('pointerdown', onPointerDown, true)
  doc.addEventListener('submit', onSubmit, true)

  return () => {
    doc.removeEventListener('click', onClick, true)
    doc.removeEventListener('pointerdown', onPointerDown, true)
    doc.removeEventListener('submit', onSubmit, true)
    doc.body?.classList.remove('training-guided-locked', 'training-guided-free', 'training-guided-target-only')
    doc.querySelectorAll('[data-training-allowed]').forEach((node) => {
      if (node instanceof HTMLElement) node.removeAttribute('data-training-allowed')
    })
    style.remove()
    historyRestore?.()
  }
}

/** @deprecated Use attachTrainingInteraction */
export function attachTrainingSafeMode(doc: Document, onTargetClick?: () => void): () => void {
  return attachTrainingInteraction(doc, {
    mode: 'locked',
    allowedKeys: [],
    onAllowedTargetClick: onTargetClick,
  })
}
