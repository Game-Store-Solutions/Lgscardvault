import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router'
import { ArrowLeft, CheckCircle2, ChevronRight, Clock, GraduationCap, Play } from 'lucide-react'
import { Badge, Button, Card, CardBody, CardHeader, buttonVariants } from '../../components/ui'
import { TRAINING_CATEGORIES, TRAINING_MODULES } from './training/modules'
import type { TrainingModule, TrainingStep } from './training/types'

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

function youtubeId(url: string): string | null {
  try {
    const parsed = new URL(url)
    if (parsed.hostname.includes('youtu.be')) return parsed.pathname.slice(1) || null
    if (parsed.hostname.includes('youtube.com')) return parsed.searchParams.get('v')
  } catch {
    return null
  }
  return null
}

function vimeoId(url: string): string | null {
  try {
    const parsed = new URL(url)
    if (!parsed.hostname.includes('vimeo.com')) return null
    const id = parsed.pathname.split('/').filter(Boolean).pop()
    return id && /^\d+$/.test(id) ? id : null
  } catch {
    return null
  }
}

function StepMedia({ step }: { step: TrainingStep }) {
  if (step.videoUrl) {
    const yt = youtubeId(step.videoUrl)
    const vimeo = vimeoId(step.videoUrl)
    if (yt) {
      return (
        <iframe
          title={step.title}
          src={`https://www.youtube-nocookie.com/embed/${yt}`}
          className="aspect-video w-full rounded-card border border-border bg-bg"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
        />
      )
    }
    if (vimeo) {
      return (
        <iframe
          title={step.title}
          src={`https://player.vimeo.com/video/${vimeo}`}
          className="aspect-video w-full rounded-card border border-border bg-bg"
          allow="autoplay; fullscreen; picture-in-picture"
          allowFullScreen
        />
      )
    }
    return (
      <video className="w-full rounded-card border border-border bg-bg" controls preload="metadata" src={step.videoUrl}>
        <track kind="captions" />
      </video>
    )
  }

  if (step.image) {
    return (
      <img
        src={step.image}
        alt={step.imageAlt ?? ''}
        className="w-full rounded-card border border-border bg-bg object-cover"
      />
    )
  }

  return null
}

export default function TrainingTab({ slug }: { slug: string }) {
  const [progress, setProgress] = useState<Progress>({})
  const [activeId, setActiveId] = useState<string | null>(null)
  const [stepIndex, setStepIndex] = useState(0)

  useEffect(() => {
    setProgress(loadProgress(slug))
  }, [slug])

  const active = TRAINING_MODULES.find((module) => module.id === activeId) ?? null
  const step = active?.steps[stepIndex]

  function openModule(module: TrainingModule) {
    setActiveId(module.id)
    setStepIndex(Math.min(progress[module.id] ?? 0, module.steps.length - 1))
  }

  function markStep(module: TrainingModule, index: number) {
    const next = { ...progress, [module.id]: Math.max(progress[module.id] ?? 0, index + 1) }
    setProgress(next)
    saveProgress(slug, next)
  }

  function goTo(module: TrainingModule, index: number) {
    setStepIndex(index)
    markStep(module, index)
  }

  const completedCount = useMemo(
    () => TRAINING_MODULES.filter((module) => (progress[module.id] ?? 0) >= module.steps.length).length,
    [progress],
  )

  if (active && step) {
    const href = step.href == null ? null : step.href === '/' ? `/s/${slug}` : `/s/${slug}${step.href}`
    return (
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Button variant="ghost" size="sm" onClick={() => setActiveId(null)}>
            <ArrowLeft aria-hidden className="size-4" />
            All modules
          </Button>
          <p className="text-sm text-fg-muted">
            Step {stepIndex + 1} of {active.steps.length}
          </p>
        </div>

        <Card>
          <CardHeader
            title={active.title}
            subtitle={step.title}
            actions={<Badge tone="neutral">{stepIndex + 1}/{active.steps.length}</Badge>}
          />
          <CardBody className="space-y-5">
            <StepMedia step={step} />
            <p className="max-w-3xl text-sm leading-6 text-fg">{step.body}</p>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap gap-2">
                {href && (
                  <Link to={href} className={buttonVariants({ variant: 'secondary', size: 'sm' })}>
                    {step.hrefLabel ?? 'Open this page'}
                    <ChevronRight aria-hidden className="size-4" />
                  </Link>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={stepIndex === 0}
                  onClick={() => goTo(active, stepIndex - 1)}
                >
                  Previous
                </Button>
                {stepIndex < active.steps.length - 1 ? (
                  <Button
                    size="sm"
                    onClick={() => {
                      markStep(active, stepIndex)
                      setStepIndex(stepIndex + 1)
                    }}
                  >
                    Next
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    onClick={() => {
                      markStep(active, stepIndex)
                      setActiveId(null)
                    }}
                  >
                    <CheckCircle2 aria-hidden className="size-4" />
                    Done
                  </Button>
                )}
              </div>
            </div>
          </CardBody>
        </Card>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-bold text-fg">Training</h2>
        <p className="mt-1 max-w-2xl text-sm text-fg-muted">
          Short walkthroughs of this admin. Open the real page from any step. Progress stays on this browser.
        </p>
        <p className="mt-2 text-sm text-fg-muted">
          {completedCount} of {TRAINING_MODULES.length} modules finished
        </p>
      </div>

      {TRAINING_CATEGORIES.map((category) => {
        const modules = TRAINING_MODULES.filter((module) => module.category === category.id)
        return (
          <section key={category.id} className="space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wide text-fg-muted">{category.label}</h3>
            <div className="grid gap-3 md:grid-cols-2">
              {modules.map((module) => {
                const doneSteps = Math.min(progress[module.id] ?? 0, module.steps.length)
                const finished = doneSteps >= module.steps.length
                return (
                  <button
                    key={module.id}
                    type="button"
                    onClick={() => openModule(module)}
                    className="rounded-card border border-border bg-surface p-4 text-left shadow-card transition-colors hover:border-brand-500/40 hover:bg-bg"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-2">
                        <span className="grid size-9 place-items-center rounded-btn bg-bg text-brand-600">
                          {finished ? <CheckCircle2 aria-hidden className="size-4" /> : <GraduationCap aria-hidden className="size-4" />}
                        </span>
                        <div>
                          <p className="font-semibold text-fg">{module.title}</p>
                          <p className="mt-0.5 flex items-center gap-1 text-xs text-fg-muted">
                            <Clock aria-hidden className="size-3.5" />
                            {module.minutes} min · {module.steps.length} steps
                          </p>
                        </div>
                      </div>
                      <Play aria-hidden className="size-4 shrink-0 text-fg-muted" />
                    </div>
                    <p className="mt-3 text-sm leading-6 text-fg-muted">{module.summary}</p>
                    <p className="mt-2 text-xs font-medium text-fg-muted">
                      {finished ? 'Finished' : doneSteps > 0 ? `${doneSteps}/${module.steps.length} complete` : 'Not started'}
                    </p>
                  </button>
                )
              })}
            </div>
          </section>
        )
      })}
    </div>
  )
}
