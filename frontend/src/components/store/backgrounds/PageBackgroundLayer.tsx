import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react'
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
  /** Branding preset picker cards — boosted visibility, no vignette. */
  thumbnail?: boolean
  /** Live branding preview — show the full pattern without a heavy vignette. */
  preview?: boolean
}

const MASK = '[mask-image:radial-gradient(ellipse_at_center,black_20%,transparent_72%)]'
const STOREFRONT_MASK = '[mask-image:radial-gradient(ellipse_at_center,black_28%,transparent_90%)]'

function edgeMask(preview?: boolean, compact?: boolean, thumbnail?: boolean): string {
  if (preview || thumbnail) return ''
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
  scaleFrom: number
  scalePeak: number
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
    scaleFrom: 0.94,
    scalePeak: 1,
  }))
}

/** Evenly stagger animated cells so the grid stays populated instead of pulsing in bursts. */
function buildAnimatedGridCells(
  count: number,
  cols: number,
  rows: number,
  compact = false,
  thumbnail = false,
): GridSpotCell[] {
  const occupied = new Set<string>()
  const cells: GridSpotCell[] = []
  const maxAttempts = count * 10

  for (let attempt = 0; cells.length < count && attempt < maxAttempts; attempt += 1) {
    const col = Math.floor(Math.random() * cols)
    const row = Math.floor(Math.random() * rows)
    const key = `${col}:${row}`
    if (occupied.has(key) && occupied.size < cols * rows * 0.75) continue
    occupied.add(key)

    const index = cells.length
    const duration = 2.8 + Math.random() * 1.8
    const wavePeriod = compact ? 8 : thumbnail ? 6 : 16
    const stagger = (index / count) * wavePeriod
    const jitter = (Math.random() - 0.5) * (wavePeriod / count) * 1.6

    cells.push({
      id: index,
      col,
      row,
      delay: Math.max(0, stagger + jitter),
      duration,
      peak: 0.5 + Math.random() * 0.34,
      repeatDelay: 0.2 + Math.random() * 0.75,
      secondary: Math.random() > 0.56,
      scaleFrom: 0.92 + Math.random() * 0.04,
      scalePeak: 0.98 + Math.random() * 0.04,
    })
  }

  return cells
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
  thumbnail,
}: {
  compact?: boolean
  density: 'spot' | 'animated'
  staticPreview?: boolean
  thumbnail?: boolean
}) {
  const cols = compact ? 16 : thumbnail ? 14 : 52
  const rows = compact ? 11 : thumbnail ? 8 : 34
  const count = density === 'animated'
    ? (compact || thumbnail ? 28 : 132)
    : compact || thumbnail
      ? 8
      : 32

  const cells = useMemo(
    () => (density === 'animated'
      ? buildAnimatedGridCells(count, cols, rows, compact, thumbnail)
      : buildGridSpotCells(count, cols, rows)),
    [compact, count, cols, rows, density, thumbnail],
  )

  const colorStrength = density === 'animated'
    ? thumbnail
      ? '92'
      : '84'
    : thumbnail
      ? '88'
      : '72'

  return (
    <>
      {cells.map((cell) => {
        const style = {
          width: GRID_CELL - 2,
          height: GRID_CELL - 2,
          left: cell.col * GRID_CELL + 1,
          top: cell.row * GRID_CELL + 1,
          backgroundColor: cell.secondary
            ? `color-mix(in srgb, var(--page-bg-pattern-secondary, var(--color-accent-500)) ${colorStrength}%, transparent)`
            : `color-mix(in srgb, var(--page-bg-pattern-primary, var(--color-brand-500)) ${colorStrength}%, transparent)`,
        } as const

        if (staticPreview) {
          return (
            <div
              key={cell.id}
              className="absolute rounded-[3px] shadow-[inset_0_0_0_1px_rgb(255_255_255/0.08)]"
              style={{ ...style, opacity: cell.peak * (thumbnail ? 1 : 0.85) }}
            />
          )
        }

        const scaleFrom = cell.scaleFrom
        const scalePeak = cell.scalePeak

        return (
          <motion.div
            key={cell.id}
            className="absolute rounded-[3px] shadow-[inset_0_0_0_1px_rgb(255_255_255/0.08)]"
            style={style}
            initial={{ opacity: 0, scale: scaleFrom }}
            animate={
              density === 'animated'
                ? { opacity: [0, cell.peak, cell.peak, 0], scale: [scaleFrom, scalePeak, scalePeak, scaleFrom] }
                : { opacity: [0, cell.peak, 0], scale: [scaleFrom, scalePeak, scaleFrom + 0.02] }
            }
            transition={{
              duration: cell.duration,
              repeat: Infinity,
              delay: cell.delay,
              repeatDelay: cell.repeatDelay,
              ease: density === 'animated' ? 'easeInOut' : 'easeInOut',
              ...(density === 'animated' ? { times: [0, 0.18, 0.72, 1] } : {}),
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
  flat = false,
}: {
  mask: string
  className?: string
  lineOpacity?: number
  children?: ReactNode
  parallax?: boolean
  /** No perspective skew — used for live scroll and static admin previews. */
  flat?: boolean
}) {
  const drift = useScrollDrift(parallax)
  const gridRepeat = GRID_CELL * 20
  const wrappedDrift = parallax ? drift % gridRepeat : drift

  return (
    <div
      aria-hidden
      className={cx(
        'pointer-events-none overflow-hidden',
        'absolute inset-0',
        mask,
        className,
      )}
    >
      <div
        className={cx(
          'absolute inset-x-0',
          parallax ? 'inset-y-[-40%] h-[220%]' : 'inset-y-[-30%] h-[200%]',
        )}
        style={{ transform: `translate3d(0, ${-wrappedDrift}px, 0)` }}
      >
        <div className={cx('absolute inset-0', flat ? '' : 'skew-y-12')}>
          <GridLines opacity={lineOpacity} />
          {children}
        </div>
      </div>
    </div>
  )
}

function GridPattern({
  className,
  mask,
  compact,
  thumbnail,
  parallax = false,
  flat = false,
  staticPreview = false,
  lineOpacity,
}: {
  className?: string
  mask: string
  compact?: boolean
  thumbnail?: boolean
  parallax?: boolean
  flat?: boolean
  staticPreview?: boolean
  lineOpacity?: number
}) {
  return (
    <SkewedGridLayer
      mask={mask}
      className={className}
      lineOpacity={lineOpacity ?? (thumbnail ? 0.62 : 0.48)}
      parallax={parallax}
      flat={flat}
    >
      <AnimatedGridCells
        compact={compact}
        density="spot"
        staticPreview={staticPreview}
        thumbnail={thumbnail}
      />
    </SkewedGridLayer>
  )
}

function AnimatedGridPattern({
  className,
  compact,
  mask,
  parallax = false,
  flat = false,
  staticPreview = false,
  thumbnail,
  lineOpacity,
}: {
  className?: string
  compact?: boolean
  mask: string
  parallax?: boolean
  flat?: boolean
  staticPreview?: boolean
  thumbnail?: boolean
  lineOpacity?: number
}) {
  return (
    <SkewedGridLayer
      mask={mask}
      className={className}
      lineOpacity={lineOpacity ?? (thumbnail ? 0.52 : 0.36)}
      parallax={parallax}
      flat={flat}
    >
      <AnimatedGridCells
        compact={compact}
        density="animated"
        staticPreview={staticPreview}
        thumbnail={thumbnail}
      />
    </SkewedGridLayer>
  )
}

function InteractiveGridPattern({
  className,
  mask,
  thumbnail,
  parallax = false,
  flat = false,
  staticPreview = false,
  preview = false,
}: {
  className?: string
  mask: string
  compact?: boolean
  thumbnail?: boolean
  parallax?: boolean
  flat?: boolean
  staticPreview?: boolean
  preview?: boolean
}) {
  const hostRef = useRef<HTMLDivElement>(null)
  const [xy, setXy] = useState({ x: 50, y: 40 })
  const drift = useScrollDrift(parallax)
  const gridRepeat = 36 * 20
  const wrappedDrift = parallax ? drift % gridRepeat : drift

  useEffect(() => {
    if (staticPreview) return

    const root = preview
      ? hostRef.current?.closest('[data-branding-preview]')
      : null

    const onMove = (event: MouseEvent | TouchEvent) => {
      const point = 'touches' in event ? event.touches[0] : event
      if (!point) return

      if (root instanceof HTMLElement) {
        const rect = root.getBoundingClientRect()
        if (rect.width <= 0 || rect.height <= 0) return
        setXy({
          x: ((point.clientX - rect.left) / rect.width) * 100,
          y: ((point.clientY - rect.top) / rect.height) * 100,
        })
        return
      }

      const w = window.innerWidth || 1
      const h = window.innerHeight || 1
      setXy({ x: (point.clientX / w) * 100, y: (point.clientY / h) * 100 })
    }

    const target = preview && root instanceof HTMLElement ? root : window
    target.addEventListener('mousemove', onMove as EventListener)
    target.addEventListener('touchmove', onMove as EventListener, { passive: true })
    return () => {
      target.removeEventListener('mousemove', onMove as EventListener)
      target.removeEventListener('touchmove', onMove as EventListener)
    }
  }, [preview, staticPreview])

  const glowX = staticPreview || thumbnail ? 42 : xy.x
  const glowY = staticPreview || thumbnail ? 48 : xy.y

  return (
    <div ref={hostRef} aria-hidden className={cx('pointer-events-none absolute inset-0 overflow-hidden', className)}>
      <div
        className={cx(
          'absolute inset-x-0',
          parallax ? 'inset-y-[-40%] h-[220%]' : 'inset-y-[-30%] h-[200%]',
        )}
        style={{ transform: parallax ? `translate3d(0, ${-wrappedDrift}px, 0)` : undefined }}
      >
        <div
          className={cx(
            'absolute inset-0',
            flat ? '' : 'skew-y-12',
            thumbnail ? 'opacity-60' : 'opacity-45',
            mask,
          )}
          style={{
            backgroundImage:
              'linear-gradient(color-mix(in srgb, var(--color-border) 65%, transparent) 1px, transparent 1px), linear-gradient(90deg, color-mix(in srgb, var(--color-border) 65%, transparent) 1px, transparent 1px)',
            backgroundSize: '36px 36px',
          }}
        />
      </div>
      <div
        className={cx(
          'absolute size-40 rounded-full blur-2xl transition-[left,top] duration-300',
          thumbnail ? 'bg-brand-500/40 dark:bg-brand-500/50' : 'bg-brand-500/14 dark:bg-brand-500/22',
          parallax ? '' : mask,
        )}
        style={{ left: `${glowX}%`, top: `${glowY}%`, transform: 'translate(-50%, -50%)' }}
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
  thumbnail = false,
  preview = false,
}: PageBackgroundLayerProps) {
  if (preset === 'none') return null

  const live = !compact && !preview && !thumbnail
  const staticPreview = compact || thumbnail
  const flatGrid = live || preview
  const mask = edgeMask(preview, compact, thumbnail)
  const gridPreset = preset === 'grid' || preset === 'animated-grid' || preset === 'interactive-grid'
  const liveGridLineOpacity = live && gridPreset ? 0.28 : undefined
  const visibleOpacity = thumbnail
    ? 1
    : preview
      ? Math.min(1, (opacity / 100) * 1.2)
      : live
        ? Math.min(1, Math.max(0.55, opacity / 100))
        : Math.min(1, Math.max(0, opacity / 100))

  return (
    <div
      className={cx(
        'pointer-events-none',
        live ? 'absolute inset-0' : 'absolute inset-0 overflow-hidden',
        live && gridPreset && STOREFRONT_MASK,
        className,
      )}
      style={{ opacity: visibleOpacity, ...patternColorStyle(patternColors ?? {}) }}
      aria-hidden
    >
      {preset === 'noise' && <NoiseTexture strong={preview || thumbnail} />}
      {preset === 'waves' && (
        <WavyBackground
          thumbnail={thumbnail}
          compact={compact && !thumbnail}
          parallax={live}
        />
      )}
      {preset === 'aurora' && (
        <AuroraBackground
          thumbnail={thumbnail}
          compact={compact && !thumbnail}
          parallax={live}
          preview={preview}
        />
      )}
      {preset === 'grid' && (
        <GridPattern
          compact={compact && !thumbnail}
          thumbnail={thumbnail}
          mask={mask}
          parallax={live}
          flat={flatGrid}
          staticPreview={staticPreview}
          lineOpacity={liveGridLineOpacity ?? (thumbnail ? 0.62 : 0.48)}
        />
      )}
      {preset === 'animated-grid' && (
        <AnimatedGridPattern
          compact={compact && !thumbnail}
          thumbnail={thumbnail}
          mask={mask}
          parallax={live}
          flat={flatGrid}
          staticPreview={staticPreview}
          lineOpacity={liveGridLineOpacity ?? (thumbnail ? 0.52 : 0.36)}
        />
      )}
      {preset === 'interactive-grid' && (
        <InteractiveGridPattern
          compact={compact && !thumbnail}
          thumbnail={thumbnail}
          mask={mask}
          parallax={live}
          flat={flatGrid}
          staticPreview={staticPreview}
          preview={preview}
        />
      )}
    </div>
  )
}
