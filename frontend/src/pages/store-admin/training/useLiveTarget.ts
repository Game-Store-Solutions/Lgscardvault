import { useCallback, useEffect, useRef, useState } from 'react'
import {
  focusTargetForBeat,
  formatTargetError,
  remeasureResolved,
  type TargetEngineContext,
} from './engine/targetEngine'
import { mapTargetPhase } from './engine/workflowController'
import { normalizeBeat } from './engine/types'
import type { EnginePhase } from './engine/types'
import type { TargetDebugInfo, TargetResolutionStatus } from './resolveTrainingTarget'
import type { TrainingBeat } from './types'

export type TargetMeasureState =
  | 'idle'
  | 'preparing'
  | 'scrolling'
  | 'searching'
  | TargetResolutionStatus

export interface MeasuredTarget {
  x: number
  y: number
  width: number
  height: number
  centerX: number
  centerY: number
}

import { IFRAME_HEIGHT, IFRAME_WIDTH } from './mapTargetCoords'

export { IFRAME_WIDTH, IFRAME_HEIGHT }

interface Options {
  iframeRef: React.RefObject<HTMLIFrameElement | null>
  containerRef: React.RefObject<HTMLElement | null>
  beat: TrainingBeat
  beatIndex: number
  beatKey: string
  priorBeats: TrainingBeat[]
  pageReady: boolean
  onReady?: (ready: boolean) => void
  onPhase?: (phase: EnginePhase) => void
  onError?: (message: string | null) => void
}

function phaseToMeasureState(phase: EnginePhase, resolutionStatus?: TargetResolutionStatus): TargetMeasureState {
  switch (phase) {
    case 'preparing':
      return 'preparing'
    case 'moving-to-target':
      return 'scrolling'
    case 'resolving-target':
    case 'positioning':
      return 'searching'
    case 'ready':
    case 'narrating':
    case 'waiting-for-interaction':
      return 'validated'
    case 'error':
      return resolutionStatus ?? 'invalid'
    default:
      return 'idle'
  }
}

export function useLiveTarget({
  iframeRef,
  containerRef,
  beat,
  beatIndex,
  beatKey,
  priorBeats,
  pageReady,
  onReady,
  onPhase,
  onError,
}: Options): {
  state: TargetMeasureState
  rect: MeasuredTarget | null
  debug: TargetDebugInfo | null
  enginePhase: EnginePhase
  targetError: string | null
  retry: () => void
} {
  const [state, setState] = useState<TargetMeasureState>('idle')
  const [enginePhase, setEnginePhase] = useState<EnginePhase>('idle')
  const [rect, setRect] = useState<MeasuredTarget | null>(null)
  const [debug, setDebug] = useState<TargetDebugInfo | null>(null)
  const [targetError, setTargetError] = useState<string | null>(null)
  const [tick, setTick] = useState(0)
  const onReadyRef = useRef(onReady)
  const onPhaseRef = useRef(onPhase)
  const onErrorRef = useRef(onError)
  onReadyRef.current = onReady
  onPhaseRef.current = onPhase
  onErrorRef.current = onError

  const retry = useCallback(() => setTick((n) => n + 1), [])

  useEffect(() => {
    onReadyRef.current?.(false)
    onPhaseRef.current?.('idle')
    onErrorRef.current?.(null)

    if (!pageReady) {
      setState('idle')
      setEnginePhase('idle')
      setRect(null)
      setDebug(null)
      setTargetError(null)
      return
    }

    let cancelled = false
    let observedTarget: HTMLElement | null = null
    let remeasureRaf = 0
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => scheduleRemeasure()) : null

    const normalized = normalizeBeat(beat, beatIndex)

    function ctx(): TargetEngineContext | null {
      const container = containerRef.current
      const iframe = iframeRef.current
      const doc = iframe?.contentDocument
      if (!container || !iframe || !doc) return null
      return { doc, iframe, container }
    }

    function setPhase(phase: EnginePhase) {
      if (cancelled) return
      setEnginePhase(phase)
      onPhaseRef.current?.(phase)
    }

    function scheduleRemeasure() {
      window.cancelAnimationFrame(remeasureRaf)
      remeasureRaf = window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => {
          if (cancelled) return
          remeasureValidated()
        })
      })
    }

    function remeasureValidated() {
      const context = ctx()
      if (!context) return

      const nextRect = remeasureResolved(context, normalized.target)
      if (nextRect) {
        setRect(nextRect)
        setState('validated')
        setPhase('ready')
        setTargetError(null)
        onErrorRef.current?.(null)
        onReadyRef.current?.(true)
      }
    }

    async function runPipeline() {
      setState('preparing')
      setPhase('preparing')
      setRect(null)
      setDebug(null)
      setTargetError(null)

      const context = ctx()
      if (!context) return

      const { resolved, resolution, timedOut } = await focusTargetForBeat(
        context,
        normalized.target,
        normalized.focus,
        {
          prepare: normalized.prepare,
          demo: normalized.demo,
          target: beat.target,
        },
        (sub) => setPhase(mapTargetPhase(sub)),
        priorBeats,
      )

      if (cancelled) return

      setDebug(resolution.debug)

      if (import.meta.env.DEV && resolution.status !== 'validated') {
        console.warn('[training] target resolution:', {
          beat: beatKey,
          target: beat.target,
          status: resolution.status,
          reason: resolution.debug.failureReason,
          timedOut,
        })
      }

      if (resolved) {
        setPhase('positioning')
        setRect(resolved.rect)
        setState('validated')
        setPhase('ready')
        setTargetError(null)
        onErrorRef.current?.(null)
        onReadyRef.current?.(true)

        const node = resolution.element
        if (ro && node && observedTarget !== node) {
          if (observedTarget) ro.unobserve(observedTarget)
          observedTarget = node
          ro.observe(node)
        }
        if (containerRef.current) ro?.observe(containerRef.current)
        return
      }

      const message = formatTargetError(resolution, timedOut)
      setPhase('error')
      setState(phaseToMeasureState('error', resolution.status))
      setRect(null)
      setTargetError(message)
      onErrorRef.current?.(message)
      onReadyRef.current?.(false)
    }

    void runPipeline()

    const win = iframeRef.current?.contentWindow
    win?.addEventListener('scroll', scheduleRemeasure, true)
    win?.addEventListener('resize', scheduleRemeasure)

    return () => {
      cancelled = true
      window.cancelAnimationFrame(remeasureRaf)
      win?.removeEventListener('scroll', scheduleRemeasure, true)
      win?.removeEventListener('resize', scheduleRemeasure)
      ro?.disconnect()
      onReadyRef.current?.(false)
      onPhaseRef.current?.('idle')
    }
  }, [iframeRef, containerRef, beat, beatIndex, beatKey, priorBeats, pageReady, tick])

  return { state, rect, debug, enginePhase, targetError, retry }
}
