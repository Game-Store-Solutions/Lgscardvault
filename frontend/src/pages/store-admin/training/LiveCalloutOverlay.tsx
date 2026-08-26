import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { computeCardPlacement, type CardPlacement } from './engine/positionInstructionCard'
import type { CalloutPlace } from './types'
import type { MeasuredTarget, TargetMeasureState } from './useLiveTarget'

interface Props {
  beatKey: string
  step: number
  stepTotal: number
  title: string
  callout: string
  place?: CalloutPlace
  target: MeasuredTarget | null
  targetState: TargetMeasureState
  containerRef: React.RefObject<HTMLElement | null>
}

const calloutTween = { duration: 0.18, ease: [0.22, 1, 0.36, 1] as const }

/** Spotlight, target emphasis, and compact floating callout — all from one validated rect. */
export default function LiveCalloutOverlay({
  beatKey,
  step,
  stepTotal,
  title,
  callout,
  place,
  target,
  targetState,
  containerRef,
}: Props) {
  const root = useRef<HTMLDivElement>(null)
  const [box, setBox] = useState({ w: 0, h: 0 })
  const [placement, setPlacement] = useState<CardPlacement | null>(null)
  const [positionSettled, setPositionSettled] = useState(false)
  const reduceMotion = useReducedMotion()

  useLayoutEffect(() => {
    const node = root.current
    if (!node) return
    const measure = () => setBox({ w: node.clientWidth, h: node.clientHeight })
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(node)
    return () => ro.disconnect()
  }, [])

  const cardW = Math.min(220, Math.max(168, box.w * 0.34))
  const cardH = 72

  const showGuide = targetState === 'validated' && target && box.w > 0
  const isTransitioning =
    targetState === 'preparing' || targetState === 'scrolling' || targetState === 'searching'

  useLayoutEffect(() => {
    if (!showGuide || !target) {
      setPositionSettled(false)
      return
    }
    setPositionSettled(true)
  }, [showGuide, target, beatKey])

  useEffect(() => {
    if (!showGuide || !target || !containerRef.current) {
      setPlacement(null)
      return
    }

    let cancelled = false
    void computeCardPlacement(target, cardW, cardH, containerRef.current, place).then((next) => {
      if (!cancelled) setPlacement(next)
    })

    return () => {
      cancelled = true
    }
  }, [showGuide, target, cardW, cardH, place, containerRef])

  if (!showGuide || !target || !placement) {
    return (
      <div ref={root} className="pointer-events-none absolute inset-0 z-20">
        {isTransitioning && (
          <div className="absolute inset-0 bg-fg/[0.04] transition-opacity duration-200" aria-hidden />
        )}
      </div>
    )
  }

  return (
    <div ref={root} className="pointer-events-none absolute inset-0 z-20 overflow-hidden">
      <span
        key={`spotlight-${beatKey}`}
        data-training-spotlight
        data-training-position-settled={positionSettled ? '1' : '0'}
        className="absolute rounded-md"
        style={{
          left: target.x,
          top: target.y,
          width: target.width,
          height: target.height,
          boxShadow:
            '0 0 0 2px rgb(59 130 246 / 0.9), 0 0 0 1px rgb(255 255 255 / 0.7), 0 0 0 9999px rgb(15 23 42 / 0.22)',
        }}
        aria-hidden
      />

      <span
        key={`dot-${beatKey}`}
        className="absolute size-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-brand-500 ring-4 ring-brand-500/20"
        style={{ left: target.centerX, top: target.centerY }}
        aria-hidden
      />

      <motion.div
        key={`callout-${beatKey}`}
        className="absolute rounded-card border border-border/80 bg-surface/95 px-3 py-2 shadow-card backdrop-blur-[2px]"
        style={{ width: cardW, maxWidth: 'min(220px, 88vw)' }}
        initial={false}
        animate={{ left: placement.x, top: placement.y, opacity: 1 }}
        transition={reduceMotion ? { duration: 0 } : calloutTween}
        role="note"
        aria-label={`Step ${step}: ${title}. ${callout}`}
      >
        <div className="flex items-start gap-2.5">
          <span className="grid size-6 shrink-0 place-items-center rounded-btn bg-brand-500/10 text-[11px] font-bold tabular-nums text-brand-700">
            {String(step).padStart(2, '0')}
          </span>
          <div className="min-w-0">
            <p className="truncate text-xs font-semibold text-fg">{title}</p>
            {callout ? (
              <p className="mt-0.5 line-clamp-2 text-[11px] leading-snug text-fg-muted">{callout}</p>
            ) : null}
          </div>
        </div>
        <p className="mt-1.5 text-[10px] tabular-nums text-fg-muted">
          Step {step} of {stepTotal}
        </p>
      </motion.div>
    </div>
  )
}
