import { arrow, autoUpdate, computePosition, flip, offset, shift } from '@floating-ui/dom'
import type { CalloutPlace } from '../types'
import type { MeasuredTarget } from '../useLiveTarget'

export interface CardPlacement {
  x: number
  y: number
  width: number
  height: number
  place: CalloutPlace
  arrowX: number
  arrowY: number
}

const PLACE_TO_SIDE: Record<CalloutPlace, 'top' | 'bottom' | 'left' | 'right'> = {
  top: 'top',
  bottom: 'bottom',
  left: 'left',
  right: 'right',
}

/**
 * Position instruction card using Floating UI against a virtual reference
 * matching the validated overlay target rect (same coordinate system).
 */
export async function computeCardPlacement(
  target: MeasuredTarget,
  cardWidth: number,
  cardHeight: number,
  container: HTMLElement,
  preference?: CalloutPlace,
): Promise<CardPlacement> {
  const virtualTarget = {
    getBoundingClientRect: () => {
      const cr = container.getBoundingClientRect()
      const scale = container.clientWidth > 0 ? cr.width / container.clientWidth : 1
      return {
        x: cr.left + target.x * scale,
        y: cr.top + target.y * scale,
        width: target.width * scale,
        height: target.height * scale,
        top: cr.top + target.y * scale,
        left: cr.left + target.x * scale,
        right: cr.left + (target.x + target.width) * scale,
        bottom: cr.top + (target.y + target.height) * scale,
      } as DOMRect
    },
  }

  const floating = document.createElement('div')
  floating.style.width = `${cardWidth}px`
  floating.style.height = `${cardHeight}px`
  floating.style.position = 'fixed'
  floating.style.visibility = 'hidden'
  floating.style.pointerEvents = 'none'
  document.body.appendChild(floating)

  try {
    const side = preference ? PLACE_TO_SIDE[preference] : undefined
    const { x, y, placement, middlewareData } = await computePosition(virtualTarget, floating, {
      strategy: 'fixed',
      placement: side ?? 'top',
      middleware: [
        offset(14),
        flip({ padding: 8, fallbackPlacements: ['top', 'bottom', 'left', 'right'] }),
        shift({ padding: 8 }),
        arrow({ element: floating, padding: 6 }),
      ],
    })

    const cr = container.getBoundingClientRect()
    const scale = container.clientWidth > 0 ? cr.width / container.clientWidth : 1

    const placeMap: Record<string, CalloutPlace> = {
      top: 'top',
      bottom: 'bottom',
      left: 'left',
      right: 'right',
    }

    return {
      x: (x - cr.left) / scale,
      y: (y - cr.top) / scale,
      width: cardWidth,
      height: cardHeight,
      place: placeMap[placement] ?? 'top',
      arrowX: middlewareData.arrow?.x ?? cardWidth / 2,
      arrowY: middlewareData.arrow?.y ?? cardHeight / 2,
    }
  } finally {
    floating.remove()
  }
}

/** Subscribe to layout changes — returns cleanup. */
export function watchTargetLayout(
  container: HTMLElement,
  targetEl: HTMLElement | null,
  onUpdate: () => void,
): () => void {
  const cleanups: (() => void)[] = []
  if (targetEl) {
    cleanups.push(
      autoUpdate(targetEl, container, onUpdate, { animationFrame: true }),
    )
  }
  const ro = new ResizeObserver(onUpdate)
  ro.observe(container)
  cleanups.push(() => ro.disconnect())
  return () => cleanups.forEach((fn) => fn())
}
