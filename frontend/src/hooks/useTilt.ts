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
const TILT_SPRING = { stiffness: 320, damping: 22, mass: 0.45 }

/** Softer light follow so the sheen trails the pointer like a physical surface. */
const LIGHT_SPRING = { stiffness: 170, damping: 24, mass: 0.5 }

/** Two incommensurate periods so idle light drifts instead of looping in a circle. */
const IDLE_A_MS = 14000
const IDLE_B_MS = 21000

export type TiltStyle = MotionStyle & {
  '--mx': MotionValue<string>
  '--my': MotionValue<string>
  '--op': MotionValue<number>
}

export interface UseTiltOptions {
  /**
   * When true, the card slowly rocks and the sheen orbits while the pointer
   * is away. Pointer takeovers instantly; idle resumes on leave.
   */
  idle?: boolean
}

/**
 * Pointer-driven holographic tilt, spring-smoothed through Framer Motion.
 *
 * Attach `ref` + the pointer handlers to a perspective wrapper, and spread
 * `tiltStyle` onto the card (`motion.div`). Rotation is a spring; `--mx/--my/--op`
 * drive `.tilt-glare` / `.tilt-holo` / `.tilt-sparkle`. Reduced-motion skips
 * rotation and idle, and keeps pointer light tracking.
 */
export function useTilt(maxTilt = 12, { idle = false }: UseTiltOptions = {}) {
  const ref = useRef<HTMLDivElement>(null)
  const hovering = useRef(false)
  const phase = useRef(Math.random() * Math.PI * 2)
  const reduceMotion = useReducedMotion()
  const inView = useInView(ref, { amount: 0.15, margin: '80px', once: false })

  const rx = useMotionValue(0)
  const ry = useMotionValue(0)
  const px = useMotionValue(50)
  const py = useMotionValue(50)
  const op = useMotionValue(idle ? 0.54 : 0)

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
    px.set(50 + Math.sin(a) * 20 + Math.sin(b * 1.15) * 8)
    py.set(50 + Math.cos(a * 0.62) * 14 + Math.sin(b) * 6)
    op.set(0.54 + Math.sin(a * 1.05) * 0.08)
    rx.set(Math.sin(a * 0.55) * maxTilt * 0.1)
    ry.set(Math.cos(a * 0.48) * maxTilt * 0.12)
  })

  const onPointerEnter = useCallback(() => {
    hovering.current = true
  }, [])

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
    if (idle && !reduceMotion) return
    rx.set(0)
    ry.set(0)
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
  }

  return { ref, onPointerEnter, onPointerMove, onPointerLeave, tiltStyle }
}

export default useTilt
