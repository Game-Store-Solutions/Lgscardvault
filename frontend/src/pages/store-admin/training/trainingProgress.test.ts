/**
 * Run: npm run training:test-progress
 */
import assert from 'node:assert/strict'
import { resumeBeatIndex } from './trainingProgress'

assert.equal(resumeBeatIndex(0, 9), 0)
assert.equal(resumeBeatIndex(3, 9), 3)
assert.equal(resumeBeatIndex(8, 9), 8)
assert.equal(resumeBeatIndex(9, 9), 0)
assert.equal(resumeBeatIndex(12, 9), 0)

console.log('trainingProgress.test.ts: all checks passed')
