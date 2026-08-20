import { Link } from 'react-router'
import { motion, useReducedMotion } from 'framer-motion'
import { ArrowRight, ShieldCheck, Sparkles, Store } from 'lucide-react'
import { TCG_GAMES } from '../../lib/tcgGames'
import { buttonVariants } from '../ui'
import { cn } from '../../lib/utils'

const EASE = [0.22, 1, 0.36, 1] as const

/** Fanned hero composition — one signature card per supported game. */
const FAN = [
  { art: TCG_GAMES[3].art, alt: 'Flesh and Blood', rotate: -16, x: '-52%', y: '6%', z: 10, scale: 0.86 },
  { art: TCG_GAMES[2].art, alt: 'One Piece', rotate: -8, x: '-27%', y: '-2%', z: 20, scale: 0.93 },
  { art: TCG_GAMES[0].art, alt: 'Magic: The Gathering', rotate: 0, x: '0%', y: '-6%', z: 30, scale: 1 },
  { art: TCG_GAMES[1].art, alt: 'Pokémon', rotate: 8, x: '27%', y: '-2%', z: 20, scale: 0.93 },
  { art: TCG_GAMES[4].art, alt: 'Riftbound', rotate: 16, x: '52%', y: '6%', z: 10, scale: 0.86 },
]

export function Hero({ hasStores }: { hasStores: boolean }) {
  const reduced = useReducedMotion()

  return (
    <section className="relative isolate overflow-hidden border-b border-border bg-bg">
      {/* Backdrop: single restrained brand wash + fine grid, masked to centre */}
      <div
        aria-hidden
        className="absolute inset-0 -z-10"
        style={{
          background:
            'radial-gradient(ellipse 70% 55% at 50% -10%, color-mix(in srgb, var(--color-brand-500) 14%, transparent), transparent 62%)',
        }}
      />
      <div
        aria-hidden
        className="absolute inset-0 -z-10 opacity-[0.18] dark:opacity-[0.22]"
        style={{
          backgroundImage:
            'linear-gradient(to right, var(--color-border) 1px, transparent 1px), linear-gradient(to bottom, var(--color-border) 1px, transparent 1px)',
          backgroundSize: '64px 64px',
          maskImage: 'radial-gradient(ellipse 70% 60% at 50% 40%, black 10%, transparent 70%)',
          WebkitMaskImage: 'radial-gradient(ellipse 70% 60% at 50% 40%, black 10%, transparent 70%)',
        }}
      />

      <div className="mx-auto grid max-w-7xl items-center gap-14 px-5 pb-20 pt-16 sm:px-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] lg:gap-10 lg:px-10 lg:pb-28 lg:pt-24">
        {/* Copy */}
        <div className="max-w-xl">
          <motion.p
            initial={reduced ? undefined : { opacity: 0, y: 10 }}
            animate={reduced ? undefined : { opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: EASE }}
            className="inline-flex items-center gap-2 rounded-full border border-border bg-surface/80 px-3 py-1.5 text-[0.6875rem] font-bold uppercase tracking-[0.16em] text-fg-muted backdrop-blur"
          >
            <Sparkles aria-hidden className="size-3.5 text-brand-500" />
            Five games · Trusted local stores
          </motion.p>

          <motion.h1
            initial={reduced ? undefined : { opacity: 0, y: 18 }}
            animate={reduced ? undefined : { opacity: 1, y: 0 }}
            transition={{ duration: 0.65, ease: EASE, delay: 0.08 }}
            className="mt-6 font-display text-[2.75rem] font-extrabold leading-[0.95] tracking-[-0.035em] text-fg sm:text-6xl lg:text-[4.25rem]"
          >
            Build your
            <br />
            <span className="text-brand-500">vault.</span>
          </motion.h1>

          <motion.p
            initial={reduced ? undefined : { opacity: 0, y: 14 }}
            animate={reduced ? undefined : { opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: EASE, delay: 0.16 }}
            className="mt-6 max-w-md text-base leading-relaxed text-fg-muted sm:text-lg"
          >
            Discover, collect and trade the cards you love — from Magic and Pokémon to One Piece,
            Flesh&nbsp;&amp;&nbsp;Blood and Riftbound.
          </motion.p>

          <motion.div
            initial={reduced ? undefined : { opacity: 0, y: 14 }}
            animate={reduced ? undefined : { opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: EASE, delay: 0.24 }}
            className="mt-9 flex flex-wrap items-center gap-3"
          >
            <Link
              to={hasStores ? '/stores' : '/register/customer'}
              className={cn(buttonVariants({ size: 'xl' }), 'group')}
            >
              Explore cards
              <ArrowRight
                aria-hidden
                className="size-4 transition-transform duration-300 group-hover:translate-x-0.5"
              />
            </Link>
            <Link to="/stores" className={buttonVariants({ variant: 'outline', size: 'xl' })}>
              <Store aria-hidden className="size-4" />
              Sell your collection
            </Link>
          </motion.div>

          <motion.div
            initial={reduced ? undefined : { opacity: 0 }}
            animate={reduced ? undefined : { opacity: 1 }}
            transition={{ duration: 0.6, ease: EASE, delay: 0.34 }}
            className="mt-10 flex flex-wrap items-center gap-x-6 gap-y-3 text-xs font-medium text-fg-muted"
          >
            <span className="inline-flex items-center gap-1.5">
              <ShieldCheck aria-hidden className="size-4 text-success-500" />
              Authentic singles
            </span>
            <span className="inline-flex items-center gap-1.5">
              <ShieldCheck aria-hidden className="size-4 text-success-500" />
              Secure checkout
            </span>
            <span className="inline-flex items-center gap-1.5">
              <ShieldCheck aria-hidden className="size-4 text-success-500" />
              One account, every store
            </span>
          </motion.div>
        </div>

        {/* Card composition */}
        <div aria-hidden className="relative hidden min-h-[26rem] lg:block">
          <div className="absolute left-1/2 top-1/2 h-[22rem] w-full max-w-[34rem] -translate-x-1/2 -translate-y-1/2">
            {FAN.map((card, i) => (
              <motion.div
                key={card.art}
                className="absolute left-1/2 top-1/2 w-[9.5rem] xl:w-[11rem]"
                style={{ zIndex: card.z }}
                initial={
                  reduced
                    ? undefined
                    : { opacity: 0, y: 40, rotate: 0, x: '-50%', translateY: '-50%', scale: 0.9 }
                }
                animate={
                  reduced
                    ? undefined
                    : {
                        opacity: 1,
                        rotate: card.rotate,
                        x: `calc(-50% + ${card.x})`,
                        y: card.y,
                        translateY: '-50%',
                        scale: card.scale,
                      }
                }
                transition={{ duration: 0.8, ease: EASE, delay: 0.15 + i * 0.09 }}
              >
                <motion.div
                  animate={reduced ? undefined : { y: [0, -7, 0] }}
                  transition={{
                    duration: 6 + i * 0.6,
                    ease: 'easeInOut',
                    repeat: Infinity,
                    delay: i * 0.35,
                  }}
                  className="overflow-hidden rounded-xl border border-white/10 shadow-[0_24px_60px_-18px_rgba(0,0,0,0.7)]"
                >
                  <img
                    src={card.art}
                    alt=""
                    className="block aspect-[5/7] w-full object-cover"
                    loading="eager"
                    decoding="async"
                  />
                </motion.div>
              </motion.div>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}

export default Hero
