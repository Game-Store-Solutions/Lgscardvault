import { useCallback, useRef, useState } from 'react'
import { ArrowLeft } from 'lucide-react'
import { Badge, Button } from '../../../components/ui'
import LiveWalkthroughStage from './LiveWalkthroughStage'
import TrainingPlayerChrome from './TrainingPlayerChrome'
import { useTrainingEngine } from './engine/useTrainingEngine'
import type { TrainingModule } from './types'
import { unlockTrainingVoice, useNarrator } from './useNarrator'

export default function GuidedLesson({
  module,
  slug,
  onBeat,
  onClose,
  startIndex = 0,
}: {
  module: TrainingModule
  slug: string
  startIndex?: number
  onBeat: (index: number) => void
  onClose: () => void
}) {
  const {
    beat,
    beatIndex,
    playing,
    muted,
    targetReady,
    narrateEnabled,
    enginePhase,
    workflow,
    onEnginePhase,
    goTo: engineGoTo,
    dispatch,
  } = useTrainingEngine(module, startIndex)

  const [retryToken, setRetryToken] = useState(0)
  const targetError = workflow.error

  const onBeatRef = useRef(onBeat)
  onBeatRef.current = onBeat

  const last = beatIndex >= module.beats.length - 1
  const completion = beat.completion ?? 'narration'

  const beatIndexRef = useRef(beatIndex)
  beatIndexRef.current = beatIndex
  const playingRef = useRef(playing)
  playingRef.current = playing
  const targetReadyRef = useRef(targetReady)
  targetReadyRef.current = targetReady
  const lastManualNavRef = useRef(0)

  const goTo = useCallback(
    (next: number, manual = true) => {
      unlockTrainingVoice()
      if (manual) lastManualNavRef.current = Date.now()
      engineGoTo(next, true)
      onBeatRef.current(Math.max(0, Math.min(module.beats.length - 1, next)))
    },
    [engineGoTo, module.beats.length],
  )

  const onTargetClick = useCallback(() => {
    if (completion !== 'target-click') return
    if (!targetReadyRef.current) return
    if (Date.now() - lastManualNavRef.current < 600) return
    if (beatIndexRef.current >= module.beats.length - 1) return
    goTo(beatIndexRef.current + 1, false)
  }, [completion, goTo, module.beats.length])

  const handleTargetError = useCallback(
    (message: string | null) => {
      if (message) dispatch({ type: 'ERROR', message })
      else dispatch({ type: 'CLEAR_ERROR' })
    },
    [dispatch],
  )

  const { status } = useNarrator({
    moduleId: module.id,
    beatIndex,
    text: beat.narration,
    enabled: narrateEnabled && !targetError,
    onEnd: (finishedBeat, natural) => {
      if (!natural) return
      if (completion !== 'narration') return
      if (!targetReadyRef.current) return
      if (Date.now() - lastManualNavRef.current < 900) return
      if (finishedBeat !== beatIndexRef.current) return
      if (!playingRef.current) return
      if (finishedBeat >= module.beats.length - 1) {
        dispatch({ type: 'TOGGLE_PLAY' })
        return
      }
      goTo(finishedBeat + 1, false)
    },
  })

  const finish = useCallback(() => {
    onBeatRef.current(module.beats.length)
    onClose()
  }, [module.beats.length, onClose])

  return (
    <div className="overflow-hidden rounded-card border border-border/80 bg-surface shadow-card">
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-border/80 px-4 py-4 sm:px-5">
        <div className="min-w-0 space-y-1">
          <p className="text-xs font-semibold uppercase tracking-wide text-fg-muted">Training</p>
          <h2 className="text-display-xs text-fg">{module.title}</h2>
          <p className="max-w-2xl text-sm leading-relaxed text-fg-muted">{module.summary}</p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <Badge tone="neutral">~{module.minutes} min</Badge>
          <Badge tone="neutral">{module.beats.length} steps</Badge>
          <Button variant="ghost" size="sm" onClick={onClose}>
            <ArrowLeft aria-hidden className="size-4" />
            All modules
          </Button>
        </div>
      </header>

      <div className="bg-bg p-3 sm:p-4">
        <LiveWalkthroughStage
          slug={slug}
          module={module}
          beat={beat}
          beatIndex={beatIndex}
          retryToken={retryToken}
          onEnginePhase={onEnginePhase}
          onTargetError={handleTargetError}
          onTargetClick={onTargetClick}
        />
      </div>

      <TrainingPlayerChrome
        module={module}
        beat={beat}
        beatIndex={beatIndex}
        playing={playing}
        muted={muted}
        targetReady={targetReady}
        voiceStatus={status}
        enginePhase={enginePhase}
        targetError={targetError}
        onRetryTarget={() => {
          dispatch({ type: 'CLEAR_ERROR' })
          setRetryToken((n) => n + 1)
        }}
        slug={slug}
        isLast={last}
        onPlayPause={() => {
          unlockTrainingVoice()
          dispatch({ type: 'TOGGLE_PLAY' })
        }}
        onPrev={() => goTo(beatIndex - 1)}
        onNext={() => goTo(beatIndex + 1)}
        onRestart={() => {
          unlockTrainingVoice()
          dispatch({ type: 'RESTART' })
          onBeatRef.current(0)
        }}
        onMute={() => dispatch({ type: 'SET_MUTED', muted: !muted })}
        onSeek={(index) => goTo(index)}
        onFinish={finish}
      />
    </div>
  )
}
