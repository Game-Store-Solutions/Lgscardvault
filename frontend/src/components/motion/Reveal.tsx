import type { ReactNode } from 'react'
import { motion, useReducedMotion, type Variants } from 'framer-motion'
import { cn } from '../../lib/utils'

const EASE = [0.22, 1, 0.36, 1] as const

/**
 * Shared motion vocabulary. Every variant here is deliberately small —
 * short travel, no bounce — so the site reads premium rather than animated.
 * All of them collapse to a plain fade when the user prefers reduced motion.
 */
export const fadeUp: Variants = {
  hidden: { opacity: 0, y: 16 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.55, ease: EASE } },
}

export const fadeIn: Variants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { duration: 0.5, ease: EASE } },
}

export const staggerChildren: Variants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.07, delayChildren: 0.05 } },
}

type RevealProps = {
  children: ReactNode
  className?: string
  /** Seconds to wait before animating in. */
  delay?: number
  /** Animate every time it scrolls into view instead of only the first time. */
  repeat?: boolean
  as?: 'div' | 'section' | 'header' | 'footer' | 'li' | 'article'
}

/**
 * Reveal — fades a block up as it scrolls into view. Under
 * `prefers-reduced-motion` it renders statically with no transform.
 */
export function Reveal({ children, className, delay = 0, repeat = false, as = 'div' }: RevealProps) {
  const reduced = useReducedMotion()
  const MotionTag = motion[as]

  if (reduced) {
    const Tag = as
    return <Tag className={className}>{children}</Tag>
  }

  return (
    <MotionTag
      className={className}
      initial="hidden"
      whileInView="visible"
      viewport={{ once: !repeat, amount: 0.2, margin: '0px 0px -80px 0px' }}
      variants={{
        hidden: { opacity: 0, y: 16 },
        visible: { opacity: 1, y: 0, transition: { duration: 0.55, ease: EASE, delay } },
      }}
    >
      {children}
    </MotionTag>
  )
}

/**
 * StaggerGroup — reveals children in sequence. Pair with `StaggerItem`.
 */
export function StaggerGroup({
  children,
  className,
  gap = 0.07,
}: {
  children: ReactNode
  className?: string
  gap?: number
}) {
  const reduced = useReducedMotion()

  if (reduced) return <div className={className}>{children}</div>

  return (
    <motion.div
      className={className}
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, amount: 0.15, margin: '0px 0px -60px 0px' }}
      variants={{ hidden: {}, visible: { transition: { staggerChildren: gap } } }}
    >
      {children}
    </motion.div>
  )
}

export function StaggerItem({ children, className }: { children: ReactNode; className?: string }) {
  const reduced = useReducedMotion()

  if (reduced) return <div className={className}>{children}</div>

  return (
    <motion.div className={cn(className)} variants={fadeUp}>
      {children}
    </motion.div>
  )
}
