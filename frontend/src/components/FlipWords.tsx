import { AnimatePresence, motion } from 'framer-motion'
import { cx } from '../lib/cx'
import { EASE_PREMIUM } from './motion'

const NAME_MS = 0.55

/**
 * Game-name crossfade: the outgoing title dissolves while the next one eases
 * in, and the box width eases with it so shorter names do not snap.
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
      transition={{ duration: NAME_MS, ease: EASE_PREMIUM }}
    >
      <motion.span
        layout="size"
        className={cx('invisible col-start-1 row-start-1 whitespace-nowrap', className)}
        transition={{ duration: NAME_MS, ease: EASE_PREMIUM }}
      >
        {word}
      </motion.span>
      <AnimatePresence initial={false}>
        <motion.span
          key={word}
          aria-hidden
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: NAME_MS, ease: EASE_PREMIUM }}
          className={cx(
            'col-start-1 row-start-1 inline-block whitespace-nowrap text-left will-change-[transform,opacity]',
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
