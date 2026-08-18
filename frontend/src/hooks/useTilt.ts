import { useCallback, useRef } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import {
  type MotionStyle,
  type MotionValue,
  useMotionTemplate,
  useMotionValue,
  useReducedMotion,
  useSpring,
} from 'framer-motion'

/** Snappy 3D follow — the card should feel in the hand, not swimming. */
const TILT_SPRING = { stiffness: 320, damping: 22, mass: 0.45 }

/** Softer light follow so the sheen trails the pointer like a physical surface. */
const LIGHT_SPRING = { stiffness: 170, damping: 24, mass: 0.5 }

export type TiltStyle = MotionStyle & {
  '--mx': MotionValue<string>
  '--my': MotionValue<string>
  '--op': MotionValue<number>
}

/**
 * Pointer-driven holographic tilt, now spring-smoothed through Framer Motion.
 *
 * Attach `ref` + the pointer handlers to a perspective wrapper, and spread
 * `tiltStyle` onto the card (`motion.div`). Rotation is a spring; `--mx/--my/--op`
 * drive `.tilt-glare` / `.tilt-holo` / `.tilt-sparkle`. Reduced-motion skips
 * rotation and keeps the light tracking.
 */
export function useTilt(maxTilt = 12) {
  const ref = useRef<HTMLDivElement>(null)
  const reduceMotion = useReducedMotion()

  const rx = useMotionValue(0)
  const ry = useMotionValue(0)
  const px = useMotionValue(50)
  const py = useMotionValue(50)
  const op = useMotionValue(0)

  const srx = useSpring(rx, TILT_SPRING)
  const sry = useSpring(ry, TILT_SPRING)
  const spx = useSpring(px, LIGHT_SPRING)
  const spy = useSpring(py, LIGHT_SPRING)
  const sop = useSpring(op, LIGHT_SPRING)

  const mx = useMotionTemplate`${spx}%`
  const my = useMotionTemplate`${spy}%`

  const onPointerMove = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      const el = ref.current
      if (!el) return
      const rect = el.getBoundingClientRect()
      const x = (event.clientX - rect.left) / rect.width
      const y = (event.clientY - rect.top) / rect.height
      px.set(x * 100)
      py.set(y * 100)
      op.set(1)
      if (reduceMotion) {
        rx.set(0)
        ry.set(0)
        return
      }
      rx.set((0.5 - y) * maxTilt)
      ry.set((x - 0.5) * maxTilt)
    },
    [maxTilt, op, px, py, reduceMotion, rx, ry],
  )

  const onPointerLeave = useCallback(() => {
    rx.set(0)
    ry.set(0)
    px.set(50)
    py.set(50)
    op.set(0)
  }, [op, px, py, rx, ry])

  const tiltStyle: TiltStyle = {
    rotateX: reduceMotion ? 0 : srx,
    rotateY: reduceMotion ? 0 : sry,
    '--mx': mx,
    '--my': my,
    '--op': sop,
  }

  return { ref, onPointerMove, onPointerLeave, tiltStyle }
}

export default useTilt
