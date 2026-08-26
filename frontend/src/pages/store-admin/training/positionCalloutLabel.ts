import type { CalloutPlace } from './types'
import type { MeasuredTarget } from './useLiveTarget'

export interface LabelBox {
  x: number
  y: number
  width: number
  height: number
}

export interface LabelPlacement {
  x: number
  y: number
  place: CalloutPlace
}

function rectsOverlap(a: LabelBox, b: LabelBox, pad = 8): boolean {
  return !(
    a.x + a.width + pad <= b.x ||
    b.x + b.width + pad <= a.x ||
    a.y + a.height + pad <= b.y ||
    b.y + b.height + pad <= a.y
  )
}

function placeAt(
  target: MeasuredTarget,
  place: CalloutPlace,
  labelW: number,
  labelH: number,
  boxW: number,
  boxH: number,
): LabelPlacement {
  const pad = 14
  switch (place) {
    case 'right':
      return {
        place,
        x: Math.min(target.x + target.width + pad, boxW - labelW - 4),
        y: Math.max(4, Math.min(target.centerY - labelH / 2, boxH - labelH - 4)),
      }
    case 'top':
      return {
        place,
        x: Math.max(4, Math.min(target.centerX - labelW / 2, boxW - labelW - 4)),
        y: Math.max(4, target.y - labelH - pad),
      }
    case 'bottom':
      return {
        place,
        x: Math.max(4, Math.min(target.centerX - labelW / 2, boxW - labelW - 4)),
        y: Math.min(target.y + target.height + pad, boxH - labelH - 4),
      }
    default:
      return {
        place: 'left',
        x: Math.max(4, target.x - labelW - pad),
        y: Math.max(4, Math.min(target.centerY - labelH / 2, boxH - labelH - 4)),
      }
  }
}

/**
 * Pick a label position that keeps the instruction box off the target and in bounds.
 * Optional `preference` is tried first; falls back to best-scoring side.
 */
export function positionCalloutLabel(
  target: MeasuredTarget,
  labelW: number,
  labelH: number,
  boxW: number,
  boxH: number,
  preference?: CalloutPlace,
): LabelPlacement {
  const targetBox: LabelBox = {
    x: target.x,
    y: target.y,
    width: target.width,
    height: target.height,
  }

  const candidates: CalloutPlace[] = preference
    ? ([preference, 'top', 'bottom', 'left', 'right'] as CalloutPlace[]).filter(
        (v, i, a) => a.indexOf(v) === i,
      )
    : ['top', 'bottom', 'left', 'right']

  let best: LabelPlacement | null = null
  let bestScore = -Infinity

  for (const place of candidates) {
    const pos = placeAt(target, place, labelW, labelH, boxW, boxH)
    const labelBox: LabelBox = { x: pos.x, y: pos.y, width: labelW, height: labelH }
    const overlaps = rectsOverlap(labelBox, targetBox)
    const inBounds =
      pos.x >= 0 && pos.y >= 0 && pos.x + labelW <= boxW + 2 && pos.y + labelH <= boxH + 2

    let score = 0
    if (!overlaps) score += 100
    if (inBounds) score += 50
    if (place === preference) score += 25
    score -= Math.hypot(pos.x + labelW / 2 - target.centerX, pos.y + labelH / 2 - target.centerY) * 0.02

    if (score > bestScore) {
      bestScore = score
      best = pos
    }
  }

  return best ?? placeAt(target, 'top', labelW, labelH, boxW, boxH)
}
