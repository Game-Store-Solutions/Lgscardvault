import { useCallback, useRef } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import {
  type MotionStyle,
  type MotionValue,
  useAnimationFrame,
  useInView,
  useMotionTemplate,
  useMotionValue,
  useReducedMotion,
  useSpring,
} from 'framer-motion'

/** Snappy 3D follow — the card should feel in the hand, not swimming. */
const TILT_SPRING = { stiffness: 380, damping: 24, mass: 0.4 }

/** Pointer light: responsive on hover so the sheen tracks the cursor cleanly. */
const LIGHT_SPRING = { stiffness: 260, damping: 28, mass: 0.4 }

/** Two incommensurate periods so idle light drifts instead of looping in a circle. */
const IDLE_A_MS = 9000
const IDLE_B_MS = 13500

export type TiltStyle = MotionStyle & {
  '--mx': MotionValue<string>
  '--my': MotionValue<string>
  '--op': MotionValue<number>
  '--foil-seed': number
}

export interface UseTiltOptions {
  /**
   * When true, the holo keeps animating while the pointer is away and the light
   * drifts across the card. Pointer takeovers instantly; leave resumes idle.
   */
  idle?: boolean
}

/**
 * Pointer-driven holographic tilt, spring-smoothed through Framer Motion.
 *
 * Attach `ref` + the pointer handlers to a perspective wrapper, and spread
 * `tiltStyle` onto the card (`motion.div`). Rotation is a spring; `--mx/--my/--op`
 * drive `.tilt-glare` / `.tilt-holo` / `.tilt-grid`. Reduced-motion skips rotation
 * and idle, and keeps pointer light tracking. `--foil-seed` desyncs holo-gradient.
 */
export function useTilt(maxTilt = 12, { idle = false }: UseTiltOptions = {}) {
  const ref = useRef<HTMLDivElement>(null)
  const hovering = useRef(false)
  const phase = useRef(Math.random() * Math.PI * 2)
  const seed = useRef(0.18 + Math.random() * 0.64)
  const reduceMotion = useReducedMotion()
  const inView = useInView(ref, { amount: 0.15, margin: '80px', once: false })

  const rx = useMotionValue(0)
  const ry = useMotionValue(0)
  const px = useMotionValue(50)
  const py = useMotionValue(50)
  const op = useMotionValue(idle ? 0.5 : 0)

  const srx = useSpring(rx, TILT_SPRING)
  const sry = useSpring(ry, TILT_SPRING)
  const spx = useSpring(px, LIGHT_SPRING)
  const spy = useSpring(py, LIGHT_SPRING)
  const sop = useSpring(op, LIGHT_SPRING)

  const mx = useMotionTemplate`${spx}%`
  const my = useMotionTemplate`${spy}%`

  useAnimationFrame((time) => {
    if (!idle || hovering.current || reduceMotion || !inView) return
    const a = (time / IDLE_A_MS) * Math.PI * 2 + phase.current
    const b = (time / IDLE_B_MS) * Math.PI * 2 + phase.current * 0.6
    px.set(50 + Math.sin(a) * 14 + Math.sin(b * 1.15) * 6)
    py.set(50 + Math.cos(a * 0.62) * 11 + Math.sin(b) * 5)
    op.set(0.5 + Math.sin(a * 0.9) * 0.1)
    rx.set(Math.sin(a * 0.55) * maxTilt * 0.08)
    ry.set(Math.cos(a * 0.48) * maxTilt * 0.1)
  })

  const onPointerEnter = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      hovering.current = true
      const el = ref.current
      if (!el) {
        op.set(0.92)
        return
      }
      const rect = el.getBoundingClientRect()
      const x = (event.clientX - rect.left) / rect.width
      const y = (event.clientY - rect.top) / rect.height
      px.set(x * 100)
      py.set(y * 100)
      op.set(0.92)
      if (!reduceMotion) {
        rx.set((0.5 - y) * maxTilt * 0.85)
        ry.set((x - 0.5) * maxTilt * 0.85)
      }
    },
    [maxTilt, op, px, py, reduceMotion, rx, ry],
  )

  const onPointerMove = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      hovering.current = true
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
    hovering.current = false
    rx.set(0)
    ry.set(0)
    if (idle && !reduceMotion) {
      // Hand light back to the idle drift; keep a soft resting sheen.
      op.set(0.5)
      return
    }
    px.set(50)
    py.set(50)
    op.set(0)
  }, [idle, op, px, py, reduceMotion, rx, ry])

  const tiltStyle: TiltStyle = {
    rotateX: reduceMotion ? 0 : srx,
    rotateY: reduceMotion ? 0 : sry,
    '--mx': mx,
    '--my': my,
    '--op': sop,
    '--foil-seed': seed.current,
  }

  return { ref, onPointerEnter, onPointerMove, onPointerLeave, tiltStyle }
}

export default useTilt
