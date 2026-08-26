import {
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Loader2,
  Pause,
  Play,
  RotateCcw,
  Volume2,
  VolumeX,
} from 'lucide-react'
import { Button, buttonVariants } from '../../../components/ui'
import TrainingTimeline from './TrainingTimeline'
import type { TrainingBeat, TrainingModule } from './types'

function statusLine(
  targetReady: boolean,
  playing: boolean,
  phase?: string,
  targetError?: string | null,
): string {
  if (targetError) return 'Step unavailable'
  if (!targetReady) {
    if (phase === 'error') return 'Step unavailable'
    if (phase === 'moving-to-target') return 'Moving to the next area…'
    if (phase === 'preparing' || phase === 'resolving-target' || phase === 'positioning') return 'Preparing step…'
    return 'Locating step…'
  }
  if (!playing) return 'Paused'
  return 'Playing'
}

function voiceHint(status: string, muted: boolean): string {
  if (muted) return 'Voice off'
  if (status === 'speaking') return 'Voice on'
  if (status === 'browser') return 'Browser voice'
  if (status === 'loading') return 'Loading voice…'
  if (status === 'blocked') return 'Tap play to enable voice'
  if (status === 'unavailable') return 'Captions only'
  return 'Voice ready'
}

interface Props {
  module: TrainingModule
  beat: TrainingBeat
  beatIndex: number
  playing: boolean
  muted: boolean
  targetReady: boolean
  voiceStatus: string
  enginePhase?: string
  targetError?: string | null
  onRetryTarget?: () => void
  slug: string
  isLast: boolean
  onPlayPause: () => void
  onPrev: () => void
  onNext: () => void
  onRestart: () => void
  onMute: () => void
  onSeek: (index: number) => void
  onFinish: () => void
}

export default function TrainingPlayerChrome({
  module,
  beat,
  beatIndex,
  playing,
  muted,
  targetReady,
  voiceStatus,
  enginePhase,
  targetError,
  onRetryTarget,
  slug,
  isLast,
  onPlayPause,
  onPrev,
  onNext,
  onRestart,
  onMute,
  onSeek,
  onFinish,
}: Props) {
  const href = beat.href === '/' ? `/s/${slug}` : `/s/${slug}${beat.href}`
  const beatLabels = module.beats.map((b) => b.title)

  return (
    <div className="border-t border-border/80 bg-surface">
      <div className="flex flex-wrap items-center gap-2 px-4 py-3">
        <Button
          variant="secondary"
          size="sm"
          onClick={onPlayPause}
          aria-label={playing ? 'Pause lesson' : 'Play lesson'}
          className="size-9 px-0"
        >
          {playing ? <Pause aria-hidden className="size-4" /> : <Play aria-hidden className="size-4" />}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={onPrev}
          disabled={beatIndex === 0}
          aria-label="Previous step"
          className="size-9 px-0"
        >
          <ChevronLeft aria-hidden className="size-4" />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={isLast ? onFinish : onNext}
          aria-label={isLast ? 'Finish lesson' : 'Next step'}
          className="size-9 px-0"
        >
          <ChevronRight aria-hidden className="size-4" />
        </Button>
        <Button variant="ghost" size="sm" onClick={onRestart} aria-label="Restart lesson" className="size-9 px-0">
          <RotateCcw aria-hidden className="size-4" />
        </Button>

        <div className="min-w-0 flex-1 px-1">
          <TrainingTimeline
            total={module.beats.length}
            current={beatIndex}
            onSelect={onSeek}
            labels={beatLabels}
          />
        </div>

        <Button
          variant="ghost"
          size="sm"
          onClick={onMute}
          aria-label={muted ? 'Unmute voice' : 'Mute voice'}
          title={voiceHint(voiceStatus, muted)}
          className="size-9 shrink-0 px-0"
        >
          {muted ? <VolumeX aria-hidden className="size-4" /> : <Volume2 aria-hidden className="size-4" />}
        </Button>

        {beat.hrefLabel && (
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className={buttonVariants({ variant: 'ghost', size: 'sm', className: 'hidden sm:inline-flex' })}
          >
            {beat.hrefLabel}
            <ExternalLink aria-hidden className="size-3.5" />
          </a>
        )}
      </div>

      <div className="space-y-2 border-t border-border/60 px-4 py-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm font-semibold text-fg">{beat.title}</p>
          <p className="flex items-center gap-1.5 text-xs text-fg-muted">
            {!targetReady && !targetError && <Loader2 aria-hidden className="size-3 animate-spin" />}
            {statusLine(targetReady, playing, enginePhase, targetError)}
            <span aria-hidden>·</span>
            {voiceHint(voiceStatus, muted)}
          </p>
        </div>

        {targetError ? (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-btn border border-border bg-bg px-3 py-2 text-sm text-fg">
            <p>{targetError}</p>
            {onRetryTarget ? (
              <Button variant="secondary" size="sm" onClick={onRetryTarget}>
                Try again
              </Button>
            ) : null}
          </div>
        ) : null}

        <p
          className="rounded-btn bg-bg/80 px-3 py-2 text-sm leading-relaxed text-fg"
          aria-live="polite"
          role="status"
        >
          {beat.narration}
        </p>
      </div>
    </div>
  )
}
