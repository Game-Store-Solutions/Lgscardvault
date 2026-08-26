import { ArrowRight, CheckCircle2, Clock, GraduationCap, PlayCircle } from 'lucide-react'
import { Badge, Card, CardBody } from '../../../components/ui'
import type { TrainingModule } from './types'

interface Props {
  module: TrainingModule
  total: number
  doneBeats: number
  finished: boolean
  onOpen: () => void
}

export default function TrainingModuleCard({ module, total, doneBeats, finished, onOpen }: Props) {
  const inProgress = !finished && doneBeats > 0

  return (
    <Card
      animateIn={false}
      className="group cursor-pointer transition-[box-shadow,ring-color] hover:ring-brand-500/25"
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onOpen()
        }
      }}
    >
      <CardBody className="space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-3">
            <span className="grid size-10 shrink-0 place-items-center rounded-btn bg-bg text-brand-600 ring-1 ring-border/60">
              {finished ? (
                <CheckCircle2 aria-hidden className="size-4 text-success-700" />
              ) : (
                <GraduationCap aria-hidden className="size-4" />
              )}
            </span>
            <div className="min-w-0">
              <p className="font-semibold text-fg">{module.title}</p>
              <p className="mt-1 flex items-center gap-1.5 text-xs text-fg-muted">
                <Clock aria-hidden className="size-3.5 shrink-0" />
                {module.minutes} min · {total} steps
              </p>
            </div>
          </div>
          <PlayCircle
            aria-hidden
            className="size-5 shrink-0 text-fg-muted transition-colors group-hover:text-brand-600"
          />
        </div>

        <p className="text-sm leading-relaxed text-fg-muted">{module.summary}</p>

        <div className="flex items-center justify-between gap-2 pt-1">
          {finished ? (
            <Badge tone="success">Completed</Badge>
          ) : inProgress ? (
            <Badge tone="neutral">
              In progress · {doneBeats}/{total}
            </Badge>
          ) : (
            <Badge tone="neutral">Not started</Badge>
          )}
          <span className="inline-flex items-center gap-1 text-xs font-semibold text-brand-600">
            {finished ? 'Review' : inProgress ? 'Continue' : 'Start'}
            <ArrowRight aria-hidden className="size-3.5" />
          </span>
        </div>
      </CardBody>
    </Card>
  )
}
