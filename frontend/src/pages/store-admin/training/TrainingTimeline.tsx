import { cx } from '../../../lib/cx'

interface Props {
  total: number
  current: number
  onSelect: (index: number) => void
  labels?: string[]
}

/** Compact video-style step timeline with chapter markers. */
export default function TrainingTimeline({ total, current, onSelect, labels }: Props) {
  const progress = total > 1 ? (current / (total - 1)) * 100 : 100

  return (
    <div className="space-y-2">
      <div className="relative h-1.5 rounded-full bg-border/80">
        <div
          className="absolute inset-y-0 left-0 rounded-full bg-brand-500 transition-[width] duration-300 ease-out"
          style={{ width: `${progress}%` }}
          aria-hidden
        />
        <div className="absolute inset-0 flex items-center justify-between px-0.5">
          {Array.from({ length: total }, (_, index) => {
            const done = index < current
            const active = index === current
            return (
              <button
                key={index}
                type="button"
                aria-label={labels?.[index] ? `Step ${index + 1}: ${labels[index]}` : `Step ${index + 1}`}
                aria-current={active ? 'step' : undefined}
                onClick={() => onSelect(index)}
                className={cx(
                  'relative z-[1] size-2.5 shrink-0 rounded-full border-2 transition-all duration-200',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40 focus-visible:ring-offset-1 focus-visible:ring-offset-surface',
                  active
                    ? 'scale-110 border-brand-500 bg-brand-500'
                    : done
                      ? 'border-brand-400 bg-brand-400'
                      : 'border-border bg-surface hover:border-brand-300',
                )}
              />
            )
          })}
        </div>
      </div>
      <p className="text-right text-xs tabular-nums text-fg-muted">
        {String(current + 1).padStart(2, '0')} / {String(total).padStart(2, '0')}
      </p>
    </div>
  )
}
