import { useEffect, useId, useMemo, useState, type ReactNode } from 'react'
import { motion } from 'framer-motion'
import type { PageBackgroundPreset, PageBackgroundThemeColors } from '../../../lib/pageBackgrounds'
import { patternColorStyle } from '../../../lib/pageBackgrounds'
import { WavyBackground } from '../../ui/WavyBackground'
import { AuroraBackground } from '../../ui/AuroraBackground'
import { cx } from '../../../lib/cx'

export interface PageBackgroundLayerProps {
  preset: PageBackgroundPreset
  opacity?: number
  /** Optional tints; unset uses brand primary/accent. */
  patternColors?: PageBackgroundThemeColors
  className?: string
  /** Smaller previews in the branding picker. */
  compact?: boolean
  /** Live branding preview — show the full pattern without a heavy vignette. */
  preview?: boolean
}

const MASK = '[mask-image:radial-gradient(ellipse_at_center,black_20%,transparent_72%)]'
const STOREFRONT_MASK = '[mask-image:radial-gradient(ellipse_at_center,black_28%,transparent_90%)]'

function edgeMask(preview?: boolean, compact?: boolean): string {
  if (preview) return ''
  if (compact) return MASK
  return STOREFRONT_MASK
}

function NoiseTexture({ className, strong }: { className?: string; strong?: boolean }) {
  const id = useId().replace(/:/g, '')
  return (
    <div className={cx('pointer-events-none absolute inset-0 opacity-80', className)} aria-hidden>
      <svg className="absolute size-0" aria-hidden>
        <filter id={`noise-${id}`}>
          <feTurbulence type="fractalNoise" baseFrequency="0.8" numOctaves="4" stitchTiles="stitch" />
        </filter>
      </svg>
      <div
        className="absolute inset-0 mix-blend-soft-light dark:mix-blend-overlay"
        style={{ filter: `url(#noise-${id})`, opacity: strong ? 0.55 : 0.35 }}
      />
    </div>
  )
}

const GRID_CELL = 40

type GridSpotCell = {
  id: number
  col: number
  row: number
  delay: number
  duration: number
  peak: number
  repeatDelay: number
  secondary: boolean
}

function buildGridSpotCells(count: number, cols: number, rows: number): GridSpotCell[] {
  return Array.from({ length: count }, (_, id) => ({
    id,
    col: Math.floor(Math.random() * cols),
    row: Math.floor(Math.random() * rows),
    delay: Math.random() * 5,
    duration: 1.6 + Math.random() * 2.4,
    peak: 0.42 + Math.random() * 0.38,
    repeatDelay: 0.4 + Math.random() * 2.8,
    secondary: Math.random() > 0.68,
  }))
}

function GridLines({ cell = GRID_CELL, opacity = 0.42 }: { cell?: number; opacity?: number }) {
  return (
    <div
      className="absolute inset-0 opacity-[var(--grid-line-opacity)]"
      style={{
        ['--grid-line-opacity' as string]: String(opacity),
        backgroundImage:
          'linear-gradient(color-mix(in srgb, var(--color-border) 78%, transparent) 1px, transparent 1px), linear-gradient(90deg, color-mix(in srgb, var(--color-border) 78%, transparent) 1px, transparent 1px)',
        backgroundSize: `${cell}px ${cell}px`,
      }}
    />
  )
}

function AnimatedGridCells({
  compact,
  density,
  staticPreview,
  scrollFollow,
}: {
  compact?: boolean
  density: 'spot' | 'animated'
  staticPreview?: boolean
  scrollFollow?: boolean
}) {
  const cols = compact ? 16 : scrollFollow ? 58 : 52
  const rows = compact ? 11 : scrollFollow ? 42 : 34
  const count = density === 'animated' ? (compact ? 26 : 88) : compact ? 10 : 32

  const cells = useMemo(() => buildGridSpotCells(count, cols, rows), [count, cols, rows])

  return (
    <>
      {cells.map((cell) => {
        const style = {
          width: GRID_CELL - 2,
          height: GRID_CELL - 2,
          left: cell.col * GRID_CELL + 1,
          top: cell.row * GRID_CELL + 1,
          backgroundColor: cell.secondary
            ? 'color-mix(in srgb, var(--page-bg-pattern-secondary, var(--color-accent-500)) 72%, transparent)'
            : 'color-mix(in srgb, var(--page-bg-pattern-primary, var(--color-brand-500)) 72%, transparent)',
        } as const

        if (staticPreview) {
          return (
            <div
              key={cell.id}
              className="absolute rounded-[3px] shadow-[inset_0_0_0_1px_rgb(255_255_255/0.08)]"
              style={{ ...style, opacity: cell.peak * 0.85 }}
            />
          )
        }

        return (
          <motion.div
            key={cell.id}
            className="absolute rounded-[3px] shadow-[inset_0_0_0_1px_rgb(255_255_255/0.08)]"
            style={style}
            initial={{ opacity: 0, scale: 0.94 }}
            animate={{ opacity: [0, cell.peak, 0], scale: [0.94, 1, 0.96] }}
            transition={{
              duration: cell.duration,
              repeat: Infinity,
              delay: cell.delay,
              repeatDelay: cell.repeatDelay,
              ease: 'easeInOut',
            }}
          />
        )
      })}
    </>
  )
}

const GRID_SCROLL_DRIFT = 0.38

function useScrollDrift(enabled: boolean): number {
  const [scrollY, setScrollY] = useState(0)

  useEffect(() => {
    if (!enabled) {
      setScrollY(0)
      return
    }

    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reducedMotion) return

    const update = () => setScrollY(window.scrollY)
    update()
    window.addEventListener('scroll', update, { passive: true })
    return () => window.removeEventListener('scroll', update)
  }, [enabled])

  return enabled ? scrollY * GRID_SCROLL_DRIFT : 0
}

function SkewedGridLayer({
  mask,
  className,
  lineOpacity,
  children,
  parallax = false,
}: {
  mask: string
  className?: string
  lineOpacity?: number
  children?: ReactNode
  parallax?: boolean
}) {
  const drift = useScrollDrift(parallax)
  const gridRepeat = GRID_CELL * 20
  const wrappedDrift = parallax ? drift % gridRepeat : drift

  return (
    <div
      aria-hidden
      className={cx(
        'pointer-events-none overflow-hidden',
        parallax ? 'fixed inset-0 z-0' : 'absolute inset-0',
        !parallax && mask,
        className,
      )}
    >
      <div
        className={cx(
          'absolute inset-x-0',
          parallax ? 'inset-y-[-55%] h-[260%]' : 'inset-y-[-30%] h-[200%]',
        )}
        style={{ transform: `translate3d(0, ${-wrappedDrift}px, 0)` }}
      >
        <div className="absolute inset-0 skew-y-12">
          <GridLines opacity={lineOpacity} />
          {children}
        </div>
      </div>
    </div>
  )
}

function GridPattern({ className, mask, compact }: { className?: string; mask: string; compact?: boolean }) {
  return (
    <SkewedGridLayer mask={mask} className={className} lineOpacity={0.48}>
      <AnimatedGridCells compact={compact} density="spot" staticPreview={compact} />
    </SkewedGridLayer>
  )
}

function AnimatedGridPattern({
  className,
  compact,
  mask,
  parallax = false,
}: {
  className?: string
  compact?: boolean
  mask: string
  parallax?: boolean
}) {
  return (
    <SkewedGridLayer mask={mask} className={className} lineOpacity={0.36} parallax={parallax}>
      <AnimatedGridCells
        compact={compact}
        density="animated"
        staticPreview={compact}
        scrollFollow={parallax}
      />
    </SkewedGridLayer>
  )
}

function InteractiveGridPattern({ className, mask, compact }: { className?: string; mask: string; compact?: boolean }) {
  const [xy, setXy] = useState({ x: 50, y: 40 })
  useEffect(() => {
    if (compact) return
    const onMove = (event: MouseEvent) => {
      const w = window.innerWidth || 1
      const h = window.innerHeight || 1
      setXy({ x: (event.clientX / w) * 100, y: (event.clientY / h) * 100 })
    }
    window.addEventListener('mousemove', onMove)
    return () => window.removeEventListener('mousemove', onMove)
  }, [compact])
  return (
    <div aria-hidden className={cx('pointer-events-none absolute inset-0', className)}>
      <div
        className={cx('absolute inset-x-0 inset-y-[-30%] h-[200%] skew-y-12 opacity-45', mask)}
        style={{
          backgroundImage:
            'linear-gradient(color-mix(in srgb, var(--color-border) 65%, transparent) 1px, transparent 1px), linear-gradient(90deg, color-mix(in srgb, var(--color-border) 65%, transparent) 1px, transparent 1px)',
          backgroundSize: '36px 36px',
        }}
      />
      <div
        className="absolute size-40 rounded-full bg-brand-500/14 blur-2xl transition-[left,top] duration-300 dark:bg-brand-500/22"
        style={{ left: `${xy.x}%`, top: `${xy.y}%`, transform: 'translate(-50%, -50%)' }}
      />
    </div>
  )
}

export function PageBackgroundLayer({
  preset,
  opacity = 72,
  patternColors,
  className,
  compact = false,
  preview = false,
}: PageBackgroundLayerProps) {
  if (preset === 'none') return null

  const mask = edgeMask(preview, compact)
  const visibleOpacity = preview
    ? Math.min(1, (opacity / 100) * 1.2)
    : Math.min(1, Math.max(0, opacity / 100))

  return (
    <div
      className={cx('pointer-events-none absolute inset-0 overflow-hidden', className)}
      style={{ opacity: visibleOpacity, ...patternColorStyle(patternColors ?? {}) }}
      aria-hidden
    >
      {preset === 'noise' && <NoiseTexture strong={preview} />}
      {preset === 'waves' && <WavyBackground compact={compact} parallax={!compact && !preview} />}
      {preset === 'aurora' && <AuroraBackground compact={compact} parallax={!compact && !preview} />}
      {preset === 'grid' && <GridPattern compact={compact} mask={mask} />}
      {preset === 'animated-grid' && (
        <AnimatedGridPattern compact={compact} mask={mask} parallax={!compact && !preview} />
      )}
      {preset === 'interactive-grid' && <InteractiveGridPattern compact={compact} mask={mask} />}
    </div>
  )
}
