/* eslint-disable react-refresh/only-export-components */
import type { ComponentProps, ReactNode } from 'react'
import { motion, MotionConfig } from 'framer-motion'
import { cx } from '../../lib/cx'

/**
 * Shared motion language for the whole app.
 *
 * Everything funnels through here so pages animate consistently instead of each
 * surface inventing its own timing. `MotionRoot` sets `reducedMotion="user"`,
 * which makes every animation below honour the OS "reduce motion" setting
 * without per-component checks.
 */

/** Premium ease-out — matches --ease-premium used by the CSS transitions. */
export const EASE_PREMIUM = [0.22, 1, 0.36, 1] as const

type DivMotionProps = ComponentProps<typeof motion.div>

export function MotionRoot({ children }: { children: ReactNode }) {
  return (
    <MotionConfig reducedMotion="user" transition={{ duration: 0.36, ease: EASE_PREMIUM }}>
      {children}
    </MotionConfig>
  )
}

/**
 * Route-level transition: keyed on the pathname so each navigation remounts and
 * fades its content in. Opacity-only so the canvas (header, background) stays
 * put and pages blend instead of lifting into place.
 *
 * Deliberately no `AnimatePresence`/`exit` here. Wrapping an `<Outlet />` in
 * `mode="wait"` holds the previous keyed wrapper on screen while the router has
 * already swapped the route underneath it, which left pages blank until a manual
 * refresh. An entrance-only animation cannot get stuck waiting on an exit.
 */
export function PageTransition({
  routeKey,
  children,
  className,
}: {
  routeKey: string
  children: ReactNode
  className?: string
}) {
  return (
    <motion.div
      key={routeKey}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.34, ease: EASE_PREMIUM }}
      className={className}
    >
      {children}
    </motion.div>
  )
}

export interface RevealProps extends DivMotionProps {
  /** Seconds to wait before animating — used to cascade sibling sections. */
  delay?: number
  /** Travel distance in px. */
  y?: number
  /** Animate on mount instead of waiting for scroll. */
  immediate?: boolean
}

/** Fade + rise as the element scrolls into view (once). */
export function Reveal({ delay = 0, y = 18, immediate = false, children, ...rest }: RevealProps) {
  const animation = {
    initial: { opacity: 0, y },
    transition: { duration: 0.45, ease: EASE_PREMIUM, delay },
    ...(immediate
      ? { animate: { opacity: 1, y: 0 } }
      : { whileInView: { opacity: 1, y: 0 }, viewport: { once: true, margin: '-60px' } }),
  }

  return (
    <motion.div {...animation} {...rest}>
      {children}
    </motion.div>
  )
}

/** Container that cascades its `StaggerItem` children into view. */
export function Stagger({
  children,
  gap = 0.06,
  delay = 0,
  immediate = false,
  className,
  ...rest
}: DivMotionProps & { gap?: number; delay?: number; immediate?: boolean }) {
  return (
    <motion.div
      initial="hidden"
      {...(immediate
        ? { animate: 'show' }
        : { whileInView: 'show', viewport: { once: true, margin: '-60px' } })}
      variants={{
        hidden: {},
        show: { transition: { staggerChildren: gap, delayChildren: delay } },
      }}
      className={className}
      {...rest}
    >
      {children}
    </motion.div>
  )
}

export function StaggerItem({ children, y = 16, className, ...rest }: DivMotionProps & { y?: number }) {
  return (
    <motion.div
      variants={{
        hidden: { opacity: 0, y },
        show: { opacity: 1, y: 0, transition: { duration: 0.42, ease: EASE_PREMIUM } },
      }}
      className={className}
      {...rest}
    >
      {children}
    </motion.div>
  )
}

/**
 * Hover/press affordance for cards and tiles. Kept small on purpose — the goal
 * is "this is interactive", not a bouncing UI.
 */
export function HoverLift({ children, className, ...rest }: DivMotionProps) {
  return (
    <motion.div
      whileHover={{ y: -4 }}
      whileTap={{ scale: 0.995 }}
      transition={{ duration: 0.22, ease: EASE_PREMIUM }}
      className={cx('h-full', className)}
      {...rest}
    >
      {children}
    </motion.div>
  )
}

const CONFETTI_COLORS = ['#c6a035', '#0a1627', '#dc2626', '#12b76a', '#f79009', '#5c7494'] as const

/**
 * Short burst of confetti for celebratory moments (e.g. import finished).
 * Honours reduced motion via MotionRoot — pieces simply fade if motion is off.
 */
export function ConfettiBurst({
  fire,
  className,
  pieces = 28,
}: {
  fire: boolean
  className?: string
  pieces?: number
}) {
  if (!fire) return null

  return (
    <div
      aria-hidden
      className={cx('pointer-events-none absolute inset-0 overflow-hidden', className)}
    >
      {Array.from({ length: pieces }, (_, i) => {
        const angle = (i / pieces) * Math.PI * 2 + (i % 3) * 0.35
        const distance = 70 + (i % 7) * 18
        const x = Math.cos(angle) * distance
        const y = Math.sin(angle) * distance - 20
        const rotate = (i % 2 === 0 ? 1 : -1) * (140 + (i % 5) * 40)
        const color = CONFETTI_COLORS[i % CONFETTI_COLORS.length]
        const delay = (i % 8) * 0.018

        return (
          <motion.span
            key={i}
            className="absolute left-1/2 top-1/2 block size-2 rounded-[1px]"
            style={{ backgroundColor: color, marginLeft: -4, marginTop: -4 }}
            initial={{ opacity: 1, x: 0, y: 0, scale: 0.4, rotate: 0 }}
            animate={{
              opacity: [1, 1, 0],
              x,
              y: y + 36,
              scale: [0.4, 1, 0.85],
              rotate,
            }}
            transition={{ duration: 0.85, ease: EASE_PREMIUM, delay }}
          />
        )
      })}
    </div>
  )
}

export { AnimatePresence, motion, Reorder, useDragControls } from 'framer-motion'
