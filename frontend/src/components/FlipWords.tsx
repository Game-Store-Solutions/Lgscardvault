import { AnimatePresence, motion } from 'framer-motion'
import { cx } from '../lib/cx'
import { EASE_PREMIUM } from './motion'

/**
 * Flip-words headline: the current name crossfades in as a single unit, with a
 * light letter stagger so it still reads as a flip rather than a hard swap.
 * Transform + opacity only — no blur/scale — so the GPU can keep it smooth.
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
  const parts = word.trim().split(/\s+/).filter(Boolean)

  return (
    <motion.span
      aria-hidden
      className="relative inline-grid overflow-hidden align-baseline"
      initial={false}
      animate={{ color: color ?? 'currentColor' }}
      transition={{ duration: 0.48, ease: EASE_PREMIUM }}
    >
      <span className={cx('invisible col-start-1 row-start-1 whitespace-nowrap', className)}>{word}</span>
      <AnimatePresence initial={false}>
        <motion.span
          key={word}
          aria-hidden
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -12 }}
          transition={{ duration: 0.48, ease: EASE_PREMIUM }}
          className={cx(
            'col-start-1 row-start-1 inline-block whitespace-nowrap text-left will-change-transform',
            className,
          )}
        >
          {parts.map((part, wordIndex) => (
            <span key={`${part}-${wordIndex}`} className="inline-block whitespace-nowrap">
              {wordIndex > 0 ? '\u00A0' : null}
              {part.split('').map((letter, letterIndex) => (
                <motion.span
                  key={`${part}-${letterIndex}`}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{
                    duration: 0.36,
                    delay: wordIndex * 0.08 + letterIndex * 0.018,
                    ease: EASE_PREMIUM,
                  }}
                  className="inline-block will-change-transform"
                >
                  {letter}
                </motion.span>
              ))}
            </span>
          ))}
        </motion.span>
      </AnimatePresence>
    </motion.span>
  )
}

export default FlipWords
