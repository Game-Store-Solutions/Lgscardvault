import { useEffect, useMemo, useState } from 'react'
import { GraduationCap } from 'lucide-react'
import { Badge } from '../../components/ui'
import GuidedLesson from './training/GuidedLesson'
import TrainingModuleCard from './training/TrainingModuleCard'
import { TRAINING_CATEGORIES, TRAINING_MODULES } from './training/modules'
import type { TrainingModule } from './training/types'
import { unlockTrainingVoice } from './training/useNarrator'

const progressKey = (slug: string) => `lgscv-training:${slug}`

type Progress = Record<string, number>

function loadProgress(slug: string): Progress {
  try {
    const raw = localStorage.getItem(progressKey(slug))
    return raw ? (JSON.parse(raw) as Progress) : {}
  } catch {
    return {}
  }
}

function saveProgress(slug: string, progress: Progress) {
  localStorage.setItem(progressKey(slug), JSON.stringify(progress))
}

function beatCount(module: TrainingModule): number {
  return module.beats.length
}

export default function TrainingTab({ slug }: { slug: string }) {
  const [progress, setProgress] = useState<Progress>({})
  const [activeId, setActiveId] = useState<string | null>(null)

  useEffect(() => {
    setProgress(loadProgress(slug))
  }, [slug])

  const active = TRAINING_MODULES.find((module) => module.id === activeId) ?? null

  function openModule(module: TrainingModule) {
    unlockTrainingVoice()
    setActiveId(module.id)
  }

  function markBeat(module: TrainingModule, index: number) {
    const next = { ...progress, [module.id]: Math.max(progress[module.id] ?? 0, index + 1) }
    setProgress(next)
    saveProgress(slug, next)
  }

  const completedCount = useMemo(
    () => TRAINING_MODULES.filter((module) => (progress[module.id] ?? 0) >= beatCount(module)).length,
    [progress],
  )

  if (active) {
    return (
      <GuidedLesson
        key={active.id}
        module={active}
        slug={slug}
        startIndex={0}
        onBeat={(index) => markBeat(active, index)}
        onClose={() => setActiveId(null)}
      />
    )
  }

  return (
    <div className="space-y-8">
      <header className="space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <span className="grid size-11 place-items-center rounded-card bg-brand-500/10 text-brand-600 ring-1 ring-brand-500/15">
            <GraduationCap aria-hidden className="size-5" />
          </span>
          <div>
            <h2 className="text-lg font-bold text-fg">Training</h2>
            <p className="text-sm text-fg-muted">Interactive lessons on the live Acme Store admin</p>
          </div>
        </div>
        <p className="max-w-3xl text-sm leading-relaxed text-fg-muted">
          Follow narrated walkthroughs on the real product UI. Voice, captions, and safe demo mode — nothing you do
          here saves settings or connects integrations.
        </p>
        <Badge tone="neutral">
          {completedCount} of {TRAINING_MODULES.length} modules completed
        </Badge>
      </header>

      {TRAINING_CATEGORIES.map((category) => {
        const modules = TRAINING_MODULES.filter((module) => module.category === category.id)
        return (
          <section key={category.id} className="space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wide text-fg-muted">{category.label}</h3>
            <div className="grid gap-3 lg:grid-cols-2">
              {modules.map((module) => {
                const total = beatCount(module)
                const doneBeats = Math.min(progress[module.id] ?? 0, total)
                const finished = doneBeats >= total
                return (
                  <TrainingModuleCard
                    key={module.id}
                    module={module}
                    total={total}
                    doneBeats={doneBeats}
                    finished={finished}
                    onOpen={() => openModule(module)}
                  />
                )
              })}
            </div>
          </section>
        )
      })}
    </div>
  )
}
