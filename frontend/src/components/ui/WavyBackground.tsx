import { useEffect, useRef } from 'react'
import { cssColorToRgba, readPatternColors } from '../../lib/canvasThemeColors'
import { cx } from '../../lib/cx'

/** How far wave crests drift down per pixel scrolled. */
const SCROLL_DRIFT = 0.42
/** Vertical repeat period so waves stay visible for the full scroll. */
const SCROLL_CYCLE_RATIO = 0.92

function drawWave(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  time: number,
  amplitude: number,
  frequency: number,
  yBase: number,
  color: string,
) {
  ctx.beginPath()
  ctx.moveTo(0, height)
  for (let x = 0; x <= width; x += 2) {
    const y =
      yBase
      + Math.sin(x * frequency + time) * amplitude
      + Math.sin(x * frequency * 0.55 + time * 1.35) * (amplitude * 0.35)
    ctx.lineTo(x, y)
  }
  ctx.lineTo(width, height)
  ctx.closePath()
  ctx.fillStyle = color
  ctx.fill()
}

type WaveSpec = {
  amp: number
  freq: number
  y: number
  speed: number
  alpha: number
  secondary: boolean
}

function waveLayout(height: number, mode: 'compact' | 'hero' | 'thumbnail'): WaveSpec[] {
  if (mode === 'thumbnail') {
    return [
      { amp: 20, freq: 0.0085, y: height * 0.34, speed: 1, alpha: 0.58, secondary: false },
      { amp: 14, freq: 0.011, y: height * 0.48, speed: 1.2, alpha: 0.42, secondary: true },
      { amp: 10, freq: 0.014, y: height * 0.58, speed: 0.9, alpha: 0.3, secondary: false },
    ]
  }
  if (mode === 'compact') {
    return [
      { amp: 14, freq: 0.0075, y: height * 0.36, speed: 1, alpha: 0.22, secondary: false },
      { amp: 10, freq: 0.0105, y: height * 0.46, speed: 1.25, alpha: 0.18, secondary: true },
      { amp: 8, freq: 0.0135, y: height * 0.54, speed: 0.85, alpha: 0.12, secondary: false },
    ]
  }
  return [
    { amp: 32, freq: 0.0055, y: height * 0.14, speed: 1, alpha: 0.14, secondary: false },
    { amp: 24, freq: 0.008, y: height * 0.22, speed: 1.2, alpha: 0.1, secondary: true },
    { amp: 18, freq: 0.011, y: height * 0.3, speed: 0.9, alpha: 0.07, secondary: false },
  ]
}

function storefrontWaves(viewportHeight: number, scrollY: number): WaveSpec[] {
  const drift = scrollY * SCROLL_DRIFT
  const period = viewportHeight * SCROLL_CYCLE_RATIO
  const wrapSpan = period + viewportHeight * 0.35

  const layers = [
    { amp: 34, freq: 0.0048, slot: 0.06, speed: 1, alpha: 0.1, secondary: false },
    { amp: 28, freq: 0.0072, slot: 0.18, speed: 1.12, alpha: 0.08, secondary: true },
    { amp: 22, freq: 0.0095, slot: 0.3, speed: 0.95, alpha: 0.06, secondary: false },
    { amp: 30, freq: 0.0058, slot: 0.48, speed: 1.05, alpha: 0.085, secondary: false },
    { amp: 24, freq: 0.0084, slot: 0.62, speed: 1.18, alpha: 0.065, secondary: true },
  ]

  return layers.map((layer) => ({
    amp: layer.amp,
    freq: layer.freq,
    speed: layer.speed,
    alpha: layer.alpha,
    secondary: layer.secondary,
    y: ((layer.slot * period + drift) % wrapSpan) - viewportHeight * 0.12,
  }))
}

export function WavyBackground({
  className,
  compact = false,
  thumbnail = false,
  /** Storefront: ambient top waves that drift down while scrolling. */
  parallax = false,
}: {
  className?: string
  compact?: boolean
  thumbnail?: boolean
  parallax?: boolean
}) {
  const hostRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const scrollRef = useRef(0)
  const layoutMode = thumbnail ? 'thumbnail' : compact ? 'compact' : 'hero'

  useEffect(() => {
    const host = hostRef.current
    const canvas = canvasRef.current
    if (!host || !canvas) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let frame = 0
    let raf = 0

    const measure = () => (parallax
      ? { width: window.innerWidth, height: window.innerHeight }
      : host.getBoundingClientRect())

    const resize = () => {
      const { width, height } = measure()
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      canvas.width = Math.max(1, Math.floor(width * dpr))
      canvas.height = Math.max(1, Math.floor(height * dpr))
      canvas.style.width = `${width}px`
      canvas.style.height = `${height}px`
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      if (reducedMotion) render()
    }

    const observer = parallax ? null : new ResizeObserver(resize)
    observer?.observe(host)
    if (parallax) window.addEventListener('resize', resize, { passive: true })
    resize()

    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches

    const onScroll = () => {
      scrollRef.current = window.scrollY
    }

    let scrollAttached = false
    if (parallax) {
      onScroll()
      if (!reducedMotion) {
        window.addEventListener('scroll', onScroll, { passive: true })
        scrollAttached = true
      }
    }

    const render = () => {
      const { width, height } = measure()
      if (width <= 0 || height <= 0) return

      const { primary, secondary, base } = readPatternColors(host)

      ctx.clearRect(0, 0, width, height)

      if (base && !parallax) {
        ctx.fillStyle = base
        ctx.fillRect(0, 0, width, height)
      }

      const time = reducedMotion ? (thumbnail ? 1.6 : 0) : frame * 0.014
      const scrollY = parallax ? scrollRef.current : 0
      const waves = parallax ? storefrontWaves(height, scrollY) : waveLayout(height, layoutMode)

      for (const wave of waves) {
        const alphaBoost = thumbnail ? 0 : compact ? 0.06 : 0
        const color = cssColorToRgba(
          wave.secondary ? secondary : primary,
          wave.alpha + alphaBoost,
        )
        drawWave(ctx, width, height, time * wave.speed, wave.amp, wave.freq, wave.y, color)
      }

      frame += 1
      if (!reducedMotion) raf = requestAnimationFrame(render)
    }

    render()

    return () => {
      observer?.disconnect()
      if (parallax) window.removeEventListener('resize', resize)
      cancelAnimationFrame(raf)
      if (scrollAttached) window.removeEventListener('scroll', onScroll)
    }
  }, [compact, layoutMode, parallax, thumbnail])

  const live = parallax && !compact && !thumbnail

  return (
    <div
      ref={hostRef}
      className={cx('absolute inset-0 overflow-hidden', live && 'opacity-90 dark:opacity-100', className)}
      aria-hidden
    >
      <canvas
        ref={canvasRef}
        className={cx('absolute inset-0 size-full', live && 'dark:mix-blend-screen')}
      />
    </div>
  )
}
