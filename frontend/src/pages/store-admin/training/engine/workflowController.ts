import type { EnginePhase } from './types'

export interface WorkflowState {
  phase: EnginePhase
  beatIndex: number
  playing: boolean
  muted: boolean
  error: string | null
}

export type WorkflowEvent =
  | { type: 'BEAT_CHANGED'; index: number; playing?: boolean }
  | { type: 'PHASE'; phase: EnginePhase }
  | { type: 'ERROR'; message: string }
  | { type: 'CLEAR_ERROR' }
  | { type: 'TOGGLE_PLAY' }
  | { type: 'SET_MUTED'; muted: boolean }
  | { type: 'RESTART' }
  | { type: 'COMPLETE' }

export const initialWorkflow = (beatIndex = 0): WorkflowState => ({
  phase: 'idle',
  beatIndex,
  playing: true,
  muted: false,
  error: null,
})

/** Map target-engine sub-phases into workflow phases. */
export function mapTargetPhase(phase: 'preparing' | 'moving-to-target' | 'resolving-target'): EnginePhase {
  if (phase === 'preparing') return 'preparing'
  if (phase === 'moving-to-target') return 'moving-to-target'
  return 'resolving-target'
}

export function workflowReducer(state: WorkflowState, event: WorkflowEvent): WorkflowState {
  switch (event.type) {
    case 'BEAT_CHANGED':
      return {
        ...state,
        beatIndex: event.index,
        playing: event.playing ?? true,
        phase: 'idle',
        error: null,
      }
    case 'PHASE':
      return {
        ...state,
        phase: event.phase,
        error: event.phase === 'error' ? state.error : event.phase === 'ready' ? null : state.error,
      }
    case 'ERROR':
      return { ...state, phase: 'error', error: event.message }
    case 'CLEAR_ERROR':
      return { ...state, error: null }
    case 'TOGGLE_PLAY':
      return {
        ...state,
        playing: !state.playing,
        phase: !state.playing && state.phase === 'paused' ? 'ready' : state.phase === 'ready' && !state.playing ? 'paused' : state.phase,
      }
    case 'SET_MUTED':
      return { ...state, muted: event.muted }
    case 'RESTART':
      return { ...initialWorkflow(0), playing: true }
    case 'COMPLETE':
      return { ...state, phase: 'completed', playing: false }
    default:
      return state
  }
}

/** Derive whether narration may start for the current beat. */
export function canNarrate(state: WorkflowState): boolean {
  return (
    state.playing &&
    !state.muted &&
    (state.phase === 'ready' || state.phase === 'narrating' || state.phase === 'waiting-for-interaction')
  )
}

export function isTargetReady(state: WorkflowState): boolean {
  return state.phase === 'ready' || state.phase === 'narrating' || state.phase === 'waiting-for-interaction'
}

export function measureStateFromPhase(phase: EnginePhase): import('../useLiveTarget').TargetMeasureState {
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
      return 'invalid'
    default:
      return 'idle'
  }
}
