/**
 * Enforces co-located mutation markers on store-admin controls that call APIs.
 * Run: npm run training:test-mutations
 *
 * Scope: only flags `.mutate()` lines that have `data-guide` within a 14-line
 * lookback (walkthrough-reachable controls). This is a textual heuristic, not an
 * AST pass — a handler farther than ~14 lines below its `data-guide` tag would
 * not be caught. Tighten the window or add AST parsing if that becomes common.
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { TRAINING_MUTATION_ATTR } from './trainingMutations'

const here = path.dirname(fileURLToPath(import.meta.url))
const storeAdminRoot = path.resolve(here, '..')

const MUTATE_IN_HANDLER = /\.mutate\s*\(/
const MARKER = TRAINING_MUTATION_ATTR

function listTsxFiles(dir: string): string[] {
  const out: string[] = []
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      if (entry.name === 'training') continue
      out.push(...listTsxFiles(full))
      continue
    }
    if (entry.isFile() && entry.name.endsWith('.tsx')) out.push(full)
  }
  return out
}

const failures: string[] = []

for (const file of listTsxFiles(storeAdminRoot)) {
  const rel = path.relative(path.resolve(here, '../../..'), file).replace(/\\/g, '/')
  const lines = fs.readFileSync(file, 'utf8').split('\n')
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!
    if (!MUTATE_IN_HANDLER.test(line)) continue
    if (line.trim().startsWith('//')) continue
    const window = lines.slice(Math.max(0, i - 14), i + 1).join('\n')
    if (!window.includes('data-guide')) continue
    if (!window.includes(MARKER)) {
      failures.push(`${rel}:${i + 1} — .mutate() handler missing ${MARKER}`)
    }
  }
}

assert.equal(
  failures.length,
  0,
  `Store-admin mutation controls must declare ${MARKER} on the clickable element:\n${failures.join('\n')}`,
)

console.log('trainingMutations.test.ts: all mutation handlers are marked')
