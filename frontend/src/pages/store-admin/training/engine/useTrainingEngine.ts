import { useCallback, useReducer, useRef } from 'react'
import type { EnginePhase } from './types'
import {
  canNarrate,
  initialWorkflow,
  isTargetReady,
  workflowReducer,
  type WorkflowState,
} from './workflowController'
import type { TrainingModule } from '../types'

/** Orchestrates lesson playback + engine phase — single source for beat/narration gating. */
export function useTrainingEngine(module: TrainingModule, startIndex = 0) {
  const [workflow, dispatch] = useReducer(workflowReducer, undefined, () => initialWorkflow(startIndex))

  const workflowRef = useRef(workflow)
  workflowRef.current = workflow

  const onEnginePhase = useCallback((phase: EnginePhase) => {
    dispatch({ type: 'PHASE', phase })
  }, [])

  const goTo = useCallback(
    (index: number, playing = true) => {
      const clamped = Math.max(0, Math.min(module.beats.length - 1, index))
      dispatch({ type: 'BEAT_CHANGED', index: clamped, playing })
    },
    [module.beats.length],
  )

  return {
    workflow,
    workflowRef,
    beatIndex: workflow.beatIndex,
    beat: module.beats[workflow.beatIndex]!,
    playing: workflow.playing,
    muted: workflow.muted,
    enginePhase: workflow.phase,
    targetReady: isTargetReady(workflow),
    narrateEnabled: canNarrate(workflow),
    onEnginePhase,
    goTo,
    dispatch,
  }
}

export type { WorkflowState }
