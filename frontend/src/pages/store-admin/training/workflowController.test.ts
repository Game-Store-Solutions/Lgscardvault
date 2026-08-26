/**
 * Run: npm run training:test-workflow
 */
import assert from 'node:assert/strict'
import {
  canNarrate,
  initialWorkflow,
  isTargetReady,
  workflowReducer,
} from './engine/workflowController'

const ready = { ...initialWorkflow(0), phase: 'ready' as const }

assert.equal(canNarrate({ ...ready, playing: true, muted: false }), true)
assert.equal(canNarrate({ ...ready, playing: false }), false)
assert.equal(canNarrate({ ...ready, muted: true }), false)
assert.equal(canNarrate({ ...ready, phase: 'preparing' }), false)

assert.equal(isTargetReady({ ...initialWorkflow(), phase: 'ready' }), true)
assert.equal(isTargetReady({ ...initialWorkflow(), phase: 'preparing' }), false)

const beat2 = workflowReducer(initialWorkflow(0), { type: 'BEAT_CHANGED', index: 2 })
assert.equal(beat2.beatIndex, 2)
assert.equal(beat2.phase, 'idle')
assert.equal(beat2.error, null)

const errored = workflowReducer(ready, { type: 'ERROR', message: 'nope' })
assert.equal(errored.phase, 'error')
assert.equal(errored.error, 'nope')

const cleared = workflowReducer(errored, { type: 'CLEAR_ERROR' })
assert.equal(cleared.error, null)

console.log('workflowController.test.ts: all checks passed')
