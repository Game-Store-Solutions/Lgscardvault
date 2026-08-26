export const IFRAME_WIDTH = 1280
export const IFRAME_HEIGHT = 800

import type { MeasuredTarget } from './useLiveTarget'

export interface TargetCoordDebug {
  nodeRect: { x: number; y: number; width: number; height: number }
  iframeRect: { x: number; y: number; width: number; height: number }
  containerRect: { x: number; y: number; width: number; height: number }
  scaleX: number
  scaleY: number
  scrollTop: number
  overlay: MeasuredTarget
}

/**
 * Single coordinate path:
 * iframe document rect → scale by iframe visual size / layout size → container-local overlay rect.
 */
export function mapTargetToContainerCoords(
  container: HTMLElement,
  iframe: HTMLIFrameElement,
  node: HTMLElement,
): MeasuredTarget | null {
  const nodeRect = node.getBoundingClientRect()
  if (nodeRect.width < 2 || nodeRect.height < 2) return null

  const iframeRect = iframe.getBoundingClientRect()
  const containerRect = container.getBoundingClientRect()

  const scaleX = iframeRect.width / IFRAME_WIDTH
  const scaleY = iframeRect.height / IFRAME_HEIGHT
  if (!Number.isFinite(scaleX) || !Number.isFinite(scaleY) || scaleX <= 0 || scaleY <= 0) {
    return null
  }

  const offsetX = iframeRect.left - containerRect.left
  const offsetY = iframeRect.top - containerRect.top

  // Iframe document rects are viewport-local; map through CSS scale into container space.
  const x = nodeRect.left * scaleX + offsetX
  const y = nodeRect.top * scaleY + offsetY
  const width = nodeRect.width * scaleX
  const height = nodeRect.height * scaleY

  if (x + width < 0 || y + height < 0) return null
  if (x > container.clientWidth + 2 || y > container.clientHeight + 2) return null

  return {
    x,
    y,
    width,
    height,
    centerX: x + width / 2,
    centerY: y + height / 2,
  }
}

export function debugTargetCoords(
  container: HTMLElement,
  iframe: HTMLIFrameElement,
  node: HTMLElement,
): TargetCoordDebug | null {
  const overlay = mapTargetToContainerCoords(container, iframe, node)
  if (!overlay) return null
  const nodeRect = node.getBoundingClientRect()
  const iframeRect = iframe.getBoundingClientRect()
  const containerRect = container.getBoundingClientRect()
  const doc = node.ownerDocument
  return {
    nodeRect: { x: nodeRect.x, y: nodeRect.y, width: nodeRect.width, height: nodeRect.height },
    iframeRect: { x: iframeRect.x, y: iframeRect.y, width: iframeRect.width, height: iframeRect.height },
    containerRect: { x: containerRect.x, y: containerRect.y, width: containerRect.width, height: containerRect.height },
    scaleX: iframeRect.width / IFRAME_WIDTH,
    scaleY: iframeRect.height / IFRAME_HEIGHT,
    scrollTop: doc?.documentElement.scrollTop ?? 0,
    overlay,
  }
}
