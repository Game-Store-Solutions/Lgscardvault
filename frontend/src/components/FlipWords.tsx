import { AnimatePresence, motion } from 'framer-motion'
import { cx } from '../lib/cx'
import { EASE_PREMIUM } from './motion'

/**
 * Flip-words headline: the current name crossfades as a single unit so the
 * reel can keep moving. Transform + opacity only — no blur/scale.
 *
 * The parent owns the cycle so the game name and the card row stay in lockstep.
 * Width hugs the current word so a shorter name does not leave a hole after it.
 */
export function FlipWords({
  word,
  color,
  className,
}: {
  word: string
  /** Per-game accent; animates with the name. */
  color?: string
  className?: string
}) {
  return (
    <motion.span
      aria-hidden
      className="relative inline-grid overflow-hidden align-baseline"
      initial={false}
      animate={{ color: color ?? 'currentColor' }}
      transition={{ duration: 0.2, ease: EASE_PREMIUM }}
    >
      <span className={cx('invisible col-start-1 row-start-1 whitespace-nowrap', className)}>{word}</span>
      <AnimatePresence initial={false}>
        <motion.span
          key={word}
          aria-hidden
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={{ duration: 0.2, ease: EASE_PREMIUM }}
          className={cx(
            'col-start-1 row-start-1 inline-block whitespace-nowrap text-left will-change-transform',
            className,
          )}
        >
          {word}
        </motion.span>
      </AnimatePresence>
    </motion.span>
  )
}

export default FlipWords
