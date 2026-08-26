/**
 * Unit checks for training overlay coordinate math.
 * Run: npx tsx frontend/src/pages/store-admin/training/targetCoordinate.test.ts
 */
import assert from 'node:assert/strict'
import { IFRAME_WIDTH } from './resolveTrainingTarget'

function scaleOverlayRect(
  nodeRect: { left: number; top: number; width: number; height: number },
  containerWidth: number,
) {
  const scale = containerWidth / IFRAME_WIDTH
  return {
    x: nodeRect.left * scale,
    y: nodeRect.top * scale,
    width: nodeRect.width * scale,
    height: nodeRect.height * scale,
  }
}

const containerWidth = 1030
const scale = containerWidth / IFRAME_WIDTH
assert.ok(Math.abs(scale - 0.8046875) < 0.0001, 'scale matches LiveWalkthroughStage')

const node = { left: 1031, top: 180, width: 165, height: 40 }
const overlay = scaleOverlayRect(node, containerWidth)
assert.ok(Math.abs(overlay.x - 829) < 2, 'x maps through scale only')
assert.ok(Math.abs(overlay.y - 145) < 2, 'y maps through scale only')
assert.ok(Math.abs(overlay.width - 133) < 2, 'width scales')
assert.ok(Math.abs(overlay.height - 32) < 2, 'height scales')

// Highlight and pointer must share one rectangle
const pointer = { centerX: overlay.x + overlay.width / 2, centerY: overlay.y + overlay.height / 2 }
assert.equal(pointer.centerX, overlay.x + overlay.width / 2)
assert.equal(pointer.centerY, overlay.y + overlay.height / 2)

console.log('targetCoordinate.test.ts: all checks passed')
