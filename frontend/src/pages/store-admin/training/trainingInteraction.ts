import type { TrainingBeat } from './types'

/** How the learner may interact with the live iframe during a beat. */
export type TrainingInteractionMode = 'locked' | 'target-only' | 'free'

/** Whether Training demonstrates or waits for learner practice. */
export type BeatKind = 'demonstration' | 'practice'

export function beatKind(beat: TrainingBeat): BeatKind {
  if (beat.kind) return beat.kind
  return beat.completion === 'target-click' ? 'practice' : 'demonstration'
}

export function beatInteractionMode(beat: TrainingBeat): TrainingInteractionMode {
  if (beat.interactionMode) return beat.interactionMode
  return beatKind(beat) === 'practice' ? 'target-only' : 'locked'
}

export function allowedTargetKeys(beat: TrainingBeat): string[] {
  const keys = new Set<string>()
  for (const field of [
    beat.target,
    beat.scrollTarget,
    beat.spotlightTarget,
    beat.tooltipTarget,
    beat.prepare?.openPanel,
    beat.prepare?.openTab,
    beat.demo?.thenClick,
  ]) {
    if (!field) continue
    for (const key of field.split('|').map((p) => p.trim()).filter(Boolean)) {
      keys.add(key)
    }
  }
  return [...keys]
}

export function beatExpectsInteraction(beat: TrainingBeat): boolean {
  return beatKind(beat) === 'practice' || beat.completion === 'target-click'
}

export function canAutoAdvance(beat: TrainingBeat): boolean {
  return (beat.completion ?? 'narration') === 'narration' && beatKind(beat) === 'demonstration'
}

export const TARGET_PIPELINE_BUDGET_MS = 24_000
export const TARGET_PIPELINE_MAX_PASSES = 10
