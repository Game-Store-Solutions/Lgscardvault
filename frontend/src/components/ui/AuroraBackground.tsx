import { useEffect, useMemo, useRef } from 'react'
import { cssColorToRgba, readCssVar } from '../../lib/canvasThemeColors'
import { cx } from '../../lib/cx'

const SCROLL_DRIFT = 0.00035

type AuroraBlob = {
  anchorX: number
  anchorY: number
  radius: number
  phase: number
  speed: number
  driftX: number
  driftY: number
  secondary: boolean
  alpha: number
}

function blobField(compact: boolean): AuroraBlob[] {
  if (compact) {
    return [
      { anchorX: 0.22, anchorY: 0.2, radius: 0.55, phase: 0, speed: 1, driftX: 0.18, driftY: 0.14, secondary: false, alpha: 0.38 },
      { anchorX: 0.72, anchorY: 0.45, radius: 0.48, phase: 2.1, speed: 1.15, driftX: 0.16, driftY: 0.18, secondary: true, alpha: 0.3 },
    ]
  }
  return [
    { anchorX: 0.18, anchorY: 0.12, radius: 0.52, phase: 0, speed: 1, driftX: 0.22, driftY: 0.16, secondary: false, alpha: 0.34 },
    { anchorX: 0.78, anchorY: 0.28, radius: 0.46, phase: 1.4, speed: 1.12, driftX: 0.19, driftY: 0.2, secondary: true, alpha: 0.26 },
    { anchorX: 0.42, anchorY: 0.58, radius: 0.4, phase: 2.8, speed: 0.92, driftX: 0.17, driftY: 0.15, secondary: false, alpha: 0.2 },
    { anchorX: 0.62, anchorY: 0.78, radius: 0.36, phase: 4.2, speed: 1.08, driftX: 0.15, driftY: 0.17, secondary: true, alpha: 0.16 },
  ]
}

function drawBlob(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  blob: AuroraBlob,
  time: number,
  scrollShift: number,
  primary: string,
  secondary: string,
  compact: boolean,
) {
  const minDim = Math.min(width, height)
  const pulse = 1 + Math.sin(time * blob.speed * 0.9 + blob.phase) * 0.18
  const x =
    width * blob.anchorX
    + Math.sin(time * blob.speed + blob.phase) * width * blob.driftX
    + scrollShift * width * 0.35
  const y =
    height * blob.anchorY
    + Math.cos(time * blob.speed * 0.82 + blob.phase * 1.3) * height * blob.driftY
    + scrollShift * height * 0.55
  const radius = minDim * blob.radius * pulse
  const color = blob.secondary ? secondary : primary
  const alpha = compact ? blob.alpha + 0.06 : blob.alpha

  const gradient = ctx.createRadialGradient(x, y, 0, x, y, radius)
  gradient.addColorStop(0, cssColorToRgba(color, alpha))
  gradient.addColorStop(0.35, cssColorToRgba(color, alpha * 0.45))
  gradient.addColorStop(0.72, cssColorToRgba(color, alpha * 0.12))
  gradient.addColorStop(1, 'rgba(0,0,0,0)')

  ctx.fillStyle = gradient
  ctx.beginPath()
  ctx.arc(x, y, radius, 0, Math.PI * 2)
  ctx.fill()
}

export function AuroraBackground({
  className,
  compact = false,
  parallax = false,
}: {
  className?: string
  compact?: boolean
  parallax?: boolean
}) {
  const hostRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const scrollRef = useRef(0)
  const blobs = useMemo(() => blobField(compact), [compact])

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

      const primary = readCssVar(host, '--page-bg-pattern-primary', readCssVar(host, '--color-brand-500', '#6d5efc'))
      const secondary = readCssVar(host, '--page-bg-pattern-secondary', readCssVar(host, '--color-accent-500', '#ff7a59'))
      const base = readCssVar(host, '--page-bg-pattern-base', '')

      ctx.clearRect(0, 0, width, height)

      if (base && !parallax) {
        ctx.fillStyle = base
        ctx.fillRect(0, 0, width, height)
      }

      const time = reducedMotion ? 0 : frame * 0.024
      const scrollShift = parallax ? scrollRef.current * SCROLL_DRIFT : 0

      blobs.forEach((blob, index) => {
        ctx.globalCompositeOperation = index === 0 ? 'source-over' : 'lighter'
        drawBlob(ctx, width, height, blob, time, scrollShift, primary, secondary, compact)
      })

      frame += 1
      if (!reducedMotion && !compact) raf = requestAnimationFrame(render)
    }

    render()

    return () => {
      observer?.disconnect()
      if (parallax) window.removeEventListener('resize', resize)
      cancelAnimationFrame(raf)
      if (scrollAttached) window.removeEventListener('scroll', onScroll)
    }
  }, [blobs, compact, parallax])

  return (
    <div
      ref={hostRef}
      className={cx(
        parallax
          ? 'pointer-events-none fixed inset-0 z-0 mix-blend-soft-light dark:mix-blend-screen'
          : 'absolute inset-0 overflow-hidden',
        className,
      )}
      aria-hidden
    >
      <canvas ref={canvasRef} className="absolute inset-0 size-full scale-110 blur-3xl" />
    </div>
  )
}
