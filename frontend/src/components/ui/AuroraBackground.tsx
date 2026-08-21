import { useEffect, useMemo, useRef } from 'react'
import { cssColorToRgba, readPatternColors } from '../../lib/canvasThemeColors'
import { cx } from '../../lib/cx'

const SCROLL_DRIFT = 0.00055
const TIME_STEP = 0.036

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

function blobField(
  compact: boolean,
  thumbnail: boolean,
  live: boolean,
  mobile: boolean,
  preview: boolean,
): AuroraBlob[] {
  if (thumbnail) {
    return [
      { anchorX: 0.2, anchorY: 0.22, radius: 0.62, phase: 0, speed: 1, driftX: 0.1, driftY: 0.08, secondary: false, alpha: 0.62 },
      { anchorX: 0.72, anchorY: 0.42, radius: 0.52, phase: 2.1, speed: 1.15, driftX: 0.1, driftY: 0.1, secondary: true, alpha: 0.48 },
    ]
  }
  if (compact) {
    return [
      { anchorX: 0.22, anchorY: 0.2, radius: 0.55, phase: 0, speed: 1, driftX: 0.18, driftY: 0.14, secondary: false, alpha: 0.38 },
      { anchorX: 0.72, anchorY: 0.45, radius: 0.48, phase: 2.1, speed: 1.15, driftX: 0.16, driftY: 0.18, secondary: true, alpha: 0.3 },
    ]
  }
  if (live) {
    if (mobile) {
      return [
        { anchorX: 0.12, anchorY: 0.08, radius: 0.72, phase: 0, speed: 1.05, driftX: 0.24, driftY: 0.18, secondary: false, alpha: 0.52 },
        { anchorX: 0.82, anchorY: 0.22, radius: 0.58, phase: 1.6, speed: 1.18, driftX: 0.2, driftY: 0.22, secondary: true, alpha: 0.4 },
        { anchorX: 0.48, anchorY: 0.72, radius: 0.5, phase: 3.1, speed: 0.96, driftX: 0.18, driftY: 0.16, secondary: false, alpha: 0.32 },
      ]
    }
    return [
      { anchorX: 0.14, anchorY: 0.06, radius: 0.58, phase: 0, speed: 1, driftX: 0.26, driftY: 0.2, secondary: false, alpha: 0.48 },
      { anchorX: 0.82, anchorY: 0.2, radius: 0.5, phase: 1.4, speed: 1.14, driftX: 0.22, driftY: 0.24, secondary: true, alpha: 0.38 },
      { anchorX: 0.38, anchorY: 0.52, radius: 0.44, phase: 2.8, speed: 0.94, driftX: 0.2, driftY: 0.18, secondary: false, alpha: 0.3 },
      { anchorX: 0.66, anchorY: 0.78, radius: 0.4, phase: 4.2, speed: 1.08, driftX: 0.18, driftY: 0.2, secondary: true, alpha: 0.24 },
    ]
  }
  if (preview) {
    return [
      { anchorX: 0.16, anchorY: 0.1, radius: 0.56, phase: 0, speed: 1, driftX: 0.2, driftY: 0.15, secondary: false, alpha: 0.44 },
      { anchorX: 0.76, anchorY: 0.3, radius: 0.48, phase: 1.5, speed: 1.1, driftX: 0.18, driftY: 0.19, secondary: true, alpha: 0.34 },
      { anchorX: 0.44, anchorY: 0.62, radius: 0.42, phase: 2.9, speed: 0.95, driftX: 0.16, driftY: 0.14, secondary: false, alpha: 0.26 },
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
  live: boolean,
) {
  const minDim = Math.min(width, height)
  const pulse = 1 + Math.sin(time * blob.speed * 0.9 + blob.phase) * (live ? 0.22 : 0.18)
  const x =
    width * blob.anchorX
    + Math.sin(time * blob.speed + blob.phase) * width * blob.driftX
    + scrollShift * width * 0.42
  const y =
    height * blob.anchorY
    + Math.cos(time * blob.speed * 0.82 + blob.phase * 1.3) * height * blob.driftY
    + scrollShift * height * 0.62
  const radius = minDim * blob.radius * pulse
  const color = blob.secondary ? secondary : primary

  const gradient = ctx.createRadialGradient(x, y, 0, x, y, radius)
  gradient.addColorStop(0, cssColorToRgba(color, blob.alpha))
  gradient.addColorStop(0.32, cssColorToRgba(color, blob.alpha * 0.55))
  gradient.addColorStop(0.68, cssColorToRgba(color, blob.alpha * 0.18))
  gradient.addColorStop(1, 'rgba(0,0,0,0)')

  ctx.fillStyle = gradient
  ctx.beginPath()
  ctx.arc(x, y, radius, 0, Math.PI * 2)
  ctx.fill()
}

export function AuroraBackground({
  className,
  compact = false,
  thumbnail = false,
  preview = false,
  parallax = false,
}: {
  className?: string
  compact?: boolean
  thumbnail?: boolean
  preview?: boolean
  parallax?: boolean
}) {
  const hostRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const scrollRef = useRef(0)
  const live = parallax && !compact && !thumbnail
  const [blobs, mobile] = useMemo(() => {
    const isMobile = typeof window !== 'undefined' && window.matchMedia('(max-width: 639px)').matches
    return [blobField(compact, thumbnail, live, isMobile, preview), isMobile] as const
  }, [compact, live, preview, thumbnail])

  useEffect(() => {
    const host = hostRef.current
    const canvas = canvasRef.current
    if (!host || !canvas) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let frame = 0
    let raf = 0
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches

    const measure = () => (parallax
      ? { width: window.innerWidth, height: window.innerHeight }
      : host.getBoundingClientRect())

    const render = () => {
      const { width, height } = measure()
      if (width <= 0 || height <= 0) return

      const { primary, secondary, base } = readPatternColors(host)

      ctx.clearRect(0, 0, width, height)

      if (base && !parallax) {
        ctx.fillStyle = base
        ctx.fillRect(0, 0, width, height)
      }

      const time = reducedMotion ? (thumbnail ? 2.4 : 0) : frame * TIME_STEP
      const scrollShift = parallax ? scrollRef.current * SCROLL_DRIFT : 0

      blobs.forEach((blob, index) => {
        ctx.globalCompositeOperation = index === 0 ? 'source-over' : 'lighter'
        drawBlob(ctx, width, height, blob, time, scrollShift, primary, secondary, live)
      })

      frame += 1
      if (!reducedMotion) raf = requestAnimationFrame(render)
    }

    const resize = () => {
      const { width, height } = measure()
      const dpr = Math.min(window.devicePixelRatio || 1, live ? 1.75 : 2)
      canvas.width = Math.max(1, Math.floor(width * dpr))
      canvas.height = Math.max(1, Math.floor(height * dpr))
      canvas.style.width = `${width}px`
      canvas.style.height = `${height}px`
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      if (reducedMotion) render()
    }

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

    const observer = parallax ? null : new ResizeObserver(resize)
    observer?.observe(host)
    if (parallax) window.addEventListener('resize', resize, { passive: true })
    resize()
    render()

    return () => {
      observer?.disconnect()
      if (parallax) window.removeEventListener('resize', resize)
      cancelAnimationFrame(raf)
      if (scrollAttached) window.removeEventListener('scroll', onScroll)
    }
  }, [blobs, compact, live, mobile, parallax, preview, thumbnail])

  return (
    <div ref={hostRef} className={cx('absolute inset-0 overflow-hidden', className)} aria-hidden>
      <canvas
        ref={canvasRef}
        className={cx(
          'absolute inset-0 size-full',
          live
            ? 'scale-105 opacity-90 blur-xl sm:scale-110 sm:blur-2xl dark:opacity-100 dark:mix-blend-screen'
            : preview
              ? 'scale-105 opacity-95 blur-2xl dark:mix-blend-screen'
              : thumbnail
                ? 'scale-105 blur-xl'
                : 'scale-110 blur-3xl',
        )}
      />
    </div>
  )
}
