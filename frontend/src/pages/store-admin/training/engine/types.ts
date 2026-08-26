import type { MeasuredTarget } from '../useLiveTarget'
import type { TargetDebugInfo } from '../resolveTrainingTarget'
import type {
  BeatCompletion,
  BeatFocus,
  CalloutPlace,
  TrainingBeat,
  TrainingBeatPrepare,
  TrainingDemo,
} from '../types'

/** Explicit workflow states — one controller owns transitions. */
export type EnginePhase =
  | 'idle'
  | 'preparing'
  | 'resolving-target'
  | 'moving-to-target'
  | 'positioning'
  | 'ready'
  | 'narrating'
  | 'waiting-for-interaction'
  | 'completed'
  | 'paused'
  | 'error'

/** Semantic target identity — never coordinates. */
export interface TargetSpec {
  id: string
  expectedLabel?: string
  expectedRole?: string
  /** Scroll this element into view (defaults to spotlight id). */
  scrollId?: string
  /** Element to highlight (defaults to id). */
  spotlightId?: string
  /** Element to anchor instruction card (defaults to spotlight). */
  tooltipId?: string
}

export interface ResolvedTarget {
  key: string
  scrollKey: string
  spotlightKey: string
  tooltipKey: string
  /** Overlay coordinates — single source for spotlight, pointer, card. */
  rect: MeasuredTarget
  debug: TargetDebugInfo
}

export interface NormalizedBeat {
  id: string
  title: string
  narration: string
  href: string
  hrefLabel?: string
  callout?: string
  place?: CalloutPlace
  focus: BeatFocus
  completion: BeatCompletion
  prepare?: TrainingBeatPrepare
  demo?: TrainingDemo
  target: TargetSpec
}

export function targetSpecFromBeat(beat: TrainingBeat, _beatIndex: number): TargetSpec {
  const raw = beat.target
  return {
    id: raw,
    expectedLabel: beat.expectedLabel,
    expectedRole: beat.expectedRole,
    scrollId: beat.scrollTarget ?? raw,
    spotlightId: beat.spotlightTarget ?? raw,
    tooltipId: beat.tooltipTarget ?? beat.spotlightTarget ?? raw,
  }
}

export function normalizeBeat(beat: TrainingBeat, beatIndex: number): NormalizedBeat {
  return {
    id: `${beatIndex}-${slugify(beat.title)}`,
    title: beat.title,
    narration: beat.narration,
    href: beat.href,
    hrefLabel: beat.hrefLabel,
    callout: beat.callout,
    place: beat.place,
    focus: beat.focus ?? 'target-if-needed',
    completion: beat.completion ?? 'narration',
    prepare: beat.prepare,
    demo: beat.demo,
    target: targetSpecFromBeat(beat, beatIndex),
  }
}

function slugify(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40)
}
