import { useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { MousePointer2 } from 'lucide-react'
import type { TrainingCallout } from './types'

function labelOffset(callout: TrainingCallout): { left: number; top: number } {
  const place = callout.place ?? 'left'
  const width = 24
  const height = 9
  let left = callout.x
  let top = callout.y
  if (place === 'left') {
    left = callout.x - width - 5
    top = callout.y - height / 2
  } else if (place === 'right') {
    left = callout.x + 6
    top = callout.y - height / 2
  } else if (place === 'top') {
    left = callout.x - width / 2
    top = callout.y - height - 7
  } else {
    left = callout.x - width / 2
    top = callout.y + 7
  }
  return {
    left: Math.min(70, Math.max(2, left)),
    top: Math.min(80, Math.max(2, top)),
  }
}

export default function CalloutOverlay({ callout }: { callout: TrainingCallout }) {
  const root = useRef<HTMLDivElement>(null)
  const [box, setBox] = useState({ w: 0, h: 0 })

  useEffect(() => {
    const node = root.current
    if (!node) return
    const measure = () => setBox({ w: node.clientWidth, h: node.clientHeight })
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(node)
    return () => observer.disconnect()
  }, [])

  const label = labelOffset(callout)
  const tipX = (callout.x / 100) * box.w
  const tipY = (callout.y / 100) * box.h
  const fromX = (label.left / 100) * box.w + 90
  const fromY = (label.top / 100) * box.h + 22
  const midX = (fromX + tipX) / 2
  const midY = Math.min(fromY, tipY) - Math.max(36, Math.abs(fromX - tipX) * 0.18)
  const path = `M ${fromX} ${fromY} Q ${midX} ${midY} ${tipX} ${tipY}`
  const length = Math.max(80, Math.hypot(tipX - fromX, tipY - fromY) * 1.2)

  return (
    <div ref={root} className="pointer-events-none absolute inset-0">
      {box.w > 0 && (
        <svg className="absolute inset-0 size-full overflow-visible" width={box.w} height={box.h} aria-hidden>
          <defs>
            <filter id="training-arrow-glow" x="-40%" y="-40%" width="180%" height="180%">
              <feDropShadow dx="0" dy="1" stdDeviation="2" floodColor="#1d4ed8" floodOpacity="0.45" />
            </filter>
            <marker id="training-arrow-head" markerWidth="14" markerHeight="14" refX="12" refY="7" orient="auto">
              <path d="M0 0 L14 7 L0 14 L4 7 Z" fill="#2563eb" />
            </marker>
          </defs>
          <path d={path} fill="none" stroke="white" strokeWidth="7" strokeLinecap="round" opacity="0.9" />
          <motion.path
            d={path}
            fill="none"
            stroke="#2563eb"
            strokeWidth="4.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            markerEnd="url(#training-arrow-head)"
            filter="url(#training-arrow-glow)"
            strokeDasharray={length}
            initial={{ strokeDashoffset: length }}
            animate={{ strokeDashoffset: 0 }}
            transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
          />
        </svg>
      )}

      <motion.span
        className="absolute size-9 -translate-x-1/2 -translate-y-1/2 rounded-full border-[3px] border-white bg-brand-500 shadow-[0_0_0_8px_rgba(37,99,235,0.22)]"
        style={{ left: `${callout.x}%`, top: `${callout.y}%` }}
        initial={{ scale: 0.4, opacity: 0 }}
        animate={{ scale: [0.9, 1.12, 1], opacity: 1 }}
        transition={{ duration: 0.55, ease: 'easeOut' }}
      />
      <span
        className="absolute size-14 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-brand-400/80 motion-safe:animate-ping"
        style={{ left: `${callout.x}%`, top: `${callout.y}%` }}
      />

      <motion.div
        className="absolute z-10 max-w-[16rem] rounded-btn bg-slate-950/92 px-3 py-2 text-xs font-bold leading-4 text-white shadow-xl ring-2 ring-white/80"
        style={{ left: `${label.left}%`, top: `${label.top}%` }}
        initial={{ opacity: 0, y: 8, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ delay: 0.25, duration: 0.28 }}
      >
        {callout.label}
      </motion.div>

      <motion.div
        className="absolute z-20 -translate-x-1/4 -translate-y-1/4 drop-shadow-lg"
        initial={{ left: '18%', top: '86%', opacity: 0, scale: 0.8 }}
        animate={{ left: `${callout.x}%`, top: `${callout.y}%`, opacity: 1, scale: 1 }}
        transition={{ duration: 0.85, ease: [0.16, 1, 0.3, 1] }}
      >
        <MousePointer2 className="size-7 fill-white text-slate-900" strokeWidth={1.75} />
      </motion.div>
    </div>
  )
}
