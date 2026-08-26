/**
 * Lists every semantic target id referenced by training beats.
 * Run: npx tsx frontend/src/pages/store-admin/training/listTrainingTargets.ts
 */
import { TRAINING_MODULES } from './modules'

const targets = new Map<string, { module: string; beat: string }[]>()

for (const module of TRAINING_MODULES) {
  module.beats.forEach((beat, index) => {
    for (const key of beat.target.split('|').map((part) => part.trim()).filter(Boolean)) {
      const list = targets.get(key) ?? []
      list.push({ module: module.id, beat: `${index + 1}: ${beat.title}` })
      targets.set(key, list)
    }
    if (beat.demo?.thenClick) {
      for (const key of beat.demo.thenClick.split('|').map((part) => part.trim()).filter(Boolean)) {
        const list = targets.get(key) ?? []
        list.push({ module: `${module.id} (demo)`, beat: `${index + 1}: ${beat.title}` })
        targets.set(key, list)
      }
    }
  })
}

console.log(`Training targets: ${targets.size} unique ids\n`)
for (const [key, refs] of [...targets.entries()].sort(([a], [b]) => a.localeCompare(b))) {
  console.log(`${key}`)
  for (const ref of refs) {
    console.log(`  · ${ref.module} — ${ref.beat}`)
  }
}
