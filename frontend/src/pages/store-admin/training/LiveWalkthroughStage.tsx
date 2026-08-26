import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { TrainingBeat, TrainingModule } from './types'
import { clearBeatHighlights } from './prepareBeatUI'
import { attachTrainingInteraction } from './trainingSafeMode'
import { allowedTargetKeys, beatInteractionMode } from './trainingInteraction'
import { ensureTrainingScroll, findGuideElement } from './trainingTargetUtils'
import LiveCalloutOverlay from './LiveCalloutOverlay'
import TargetDebugPanel from './TargetDebugPanel'
import { IFRAME_HEIGHT, IFRAME_WIDTH, useLiveTarget } from './useLiveTarget'
import type { EnginePhase } from './engine/types'

interface Props {
  slug: string
  module: TrainingModule
  beat: TrainingBeat
  beatIndex: number
  retryToken?: number
  onTargetClick?: () => void
  onEnginePhase?: (phase: EnginePhase) => void
  onTargetError?: (message: string | null) => void
}

function beatFramePath(slug: string, href: string): string {
  if (href === '/') return `/s/${slug}?training=1`
  return `/s/${slug}${href}?training=1`
}

function verifyBeatAction(doc: Document, beat: TrainingBeat): boolean {
  const verifyId = beat.verifyTarget ?? beat.target
  const el = findGuideElement(doc, verifyId)
  if (!el) return false
  const rect = el.getBoundingClientRect()
  return rect.width >= 2 && rect.height >= 2
}

/** Live admin/storefront iframe — product UI stays dominant; guidance is a light overlay. */
export default function LiveWalkthroughStage({
  slug,
  module,
  beat,
  beatIndex,
  retryToken = 0,
  onTargetClick,
  onEnginePhase,
  onTargetError,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const [pageReady, setPageReady] = useState(false)
  const [scale, setScale] = useState(1)
  const detachInteractionRef = useRef<(() => void) | null>(null)
  const loadedSrcRef = useRef<string | null>(null)
  const beatKey = `${module.id}-${beatIndex}`
  const priorBeats = useMemo(() => module.beats.slice(0, beatIndex), [module.beats, beatIndex])
  const onTargetClickRef = useRef(onTargetClick)
  onTargetClickRef.current = onTargetClick

  const frameSrc = beatFramePath(slug, beat.href)
  const interactionMode = beatInteractionMode(beat)
  const allowedKeys = useMemo(() => allowedTargetKeys(beat), [beat])

  const { state: targetState, rect, debug, enginePhase, targetError, retry } = useLiveTarget({
    iframeRef,
    containerRef,
    beat,
    beatIndex,
    beatKey,
    priorBeats,
    pageReady,
    onPhase: onEnginePhase,
    onError: onTargetError,
  })

  useEffect(() => {
    if (retryToken > 0) retry()
  }, [retryToken, retry])

  useEffect(() => {
    if (loadedSrcRef.current === frameSrc) return
    loadedSrcRef.current = frameSrc
    setPageReady(false)
    detachInteractionRef.current?.()
    detachInteractionRef.current = null
  }, [frameSrc])

  useEffect(() => {
    const iframe = iframeRef.current
    const doc = iframe?.contentDocument
    if (!doc || !pageReady) return
    clearBeatHighlights(doc)
  }, [beatKey, pageReady])

  useEffect(() => {
    const iframe = iframeRef.current
    const doc = iframe?.contentDocument
    if (!doc || !pageReady) return

    detachInteractionRef.current?.()
    detachInteractionRef.current = attachTrainingInteraction(doc, {
      mode: interactionMode,
      allowedKeys,
      onAllowedTargetClick: () => {
        const completion = beat.completion ?? 'narration'
        if (completion !== 'target-click') return
        if (!verifyBeatAction(doc, beat)) return
        onTargetClickRef.current?.()
      },
    })

    return () => detachInteractionRef.current?.()
  }, [beat, beatKey, pageReady, interactionMode, allowedKeys])

  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    const update = () => setScale(container.clientWidth / IFRAME_WIDTH)
    update()
    const ro = new ResizeObserver(update)
    ro.observe(container)
    return () => ro.disconnect()
  }, [])

  const onIframeLoad = useCallback(() => {
    const iframe = iframeRef.current
    const doc = iframe?.contentDocument
    if (!doc) return
    ensureTrainingScroll(doc)
    clearBeatHighlights(doc)
    setPageReady(true)
  }, [])

  useEffect(() => () => detachInteractionRef.current?.(), [])

  const scaledHeight = IFRAME_HEIGHT * scale

  return (
    <div
      ref={containerRef}
      className="relative w-full overflow-hidden rounded-card bg-bg ring-1 ring-border/60"
      style={{ height: scaledHeight }}
    >
      <iframe
        ref={iframeRef}
        title={`Training preview — ${beat.title}`}
        src={frameSrc}
        className="absolute left-0 top-0 origin-top-left border-0 bg-bg"
        style={{
          width: IFRAME_WIDTH,
          height: IFRAME_HEIGHT,
          transform: `scale(${scale})`,
        }}
        onLoad={onIframeLoad}
      />

      {import.meta.env.DEV && localStorage.getItem('training-debug') === '1' && (
        <TargetDebugPanel
          beatKey={beatKey}
          callout={beat.callout ?? beat.title}
          state={pageReady ? targetState : 'idle'}
          debug={debug}
          enginePhase={enginePhase}
        />
      )}

      <LiveCalloutOverlay
        beatKey={beatKey}
        step={beatIndex + 1}
        stepTotal={module.beats.length}
        title={beat.title}
        callout={beat.callout && beat.callout !== beat.title ? beat.callout : ''}
        place={beat.place}
        target={rect}
        targetState={pageReady ? targetState : 'idle'}
        containerRef={containerRef}
      />

      {targetError && pageReady && (
        <div className="absolute inset-x-0 bottom-3 z-30 flex justify-center px-3">
          <div className="flex max-w-md items-center gap-2 rounded-card border border-border bg-surface/95 px-3 py-2 text-xs text-fg shadow-card">
            <span>{targetError}</span>
            <button
              type="button"
              className="shrink-0 rounded-btn bg-brand-500 px-2 py-1 text-[11px] font-semibold text-white"
              onClick={() => retry()}
            >
              Try again
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
