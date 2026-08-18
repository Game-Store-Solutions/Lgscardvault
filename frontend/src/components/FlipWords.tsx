import { AnimatePresence, motion } from 'framer-motion'
import { cx } from '../lib/cx'

/**
 * Flip-words headline: the current word exits with a blur/scale, then the next
 * one spells in letter-by-letter. Inspired by Sera UI's FlipWords, written to
 * sit inside our existing MotionRoot (so `prefers-reduced-motion` is honoured).
 *
 * The parent owns the cycle so the game name and the card row stay in lockstep.
 */
export function FlipWords({
  word,
  reserve,
  className,
}: {
  word: string
  /** Names used to reserve width so the headline doesn't jump as they cycle. */
  reserve?: string[]
  className?: string
}) {
  const parts = word.trim().split(/\s+/).filter(Boolean)
  const widest = (reserve && reserve.length > 0 ? reserve : [word]).reduce((best, candidate) =>
    candidate.length > best.length ? candidate : best,
  )

  return (
    <span aria-hidden className="relative inline-grid align-baseline">
      {/* Invisible sizer so the headline doesn't jump as names change length. */}
      <span className={cx('invisible col-start-1 row-start-1 whitespace-nowrap', className)}>{widest}</span>
      <AnimatePresence mode="wait">
        <motion.span
          key={word}
          aria-hidden
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{
            opacity: 0,
            y: -36,
            x: 28,
            filter: 'blur(8px)',
            scale: 1.55,
            transition: { type: 'spring', stiffness: 200, damping: 22 },
          }}
          transition={{ type: 'spring', stiffness: 150, damping: 16, mass: 0.8 }}
          className={cx('col-start-1 row-start-1 inline-block whitespace-nowrap text-left', className)}
        >
          {parts.map((part, wordIndex) => (
            <span key={`${part}-${wordIndex}`} className="inline-block whitespace-nowrap">
              {wordIndex > 0 ? '\u00A0' : null}
              {part.split('').map((letter, letterIndex) => (
                <motion.span
                  key={`${part}-${letterIndex}`}
                  initial={{ opacity: 0, y: 8, filter: 'blur(8px)' }}
                  animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                  transition={{
                    delay: wordIndex * 0.22 + letterIndex * 0.035,
                    type: 'spring',
                    stiffness: 140,
                    damping: 14,
                  }}
                  className="inline-block"
                >
                  {letter}
                </motion.span>
              ))}
            </span>
          ))}
        </motion.span>
      </AnimatePresence>
    </span>
  )
}

export default FlipWords
