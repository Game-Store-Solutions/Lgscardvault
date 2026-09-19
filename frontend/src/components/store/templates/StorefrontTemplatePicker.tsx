import { RotateCcw } from 'lucide-react'
import {
  STOREFRONT_TEMPLATE_OPTIONS,
  type StorefrontTemplate,
} from '../../../lib/storefrontTemplates'
import { cx } from '../../../lib/cx'
import { Button } from '../../ui'

function TemplateMini({ id, selected }: { id: StorefrontTemplate; selected: boolean }) {
  if (id === 'campaign') {
    return (
      <div
        className={cx(
          'overflow-hidden rounded-lg border',
          selected ? 'border-brand-500' : 'border-border',
        )}
        aria-hidden
      >
        <div className="flex h-16 flex-col justify-end bg-fg px-2.5 pb-2">
          <span className="h-2 w-3/4 bg-surface" />
          <span className="mt-1 h-1.5 w-1/3 bg-brand-500" />
        </div>
        <div className="flex h-5 items-center gap-1 bg-surface px-2">
          <span className="h-1 flex-1 bg-border" />
          <span className="h-1 flex-1 bg-border" />
          <span className="h-1 flex-1 bg-border" />
        </div>
        <div className="grid h-10 grid-cols-3 gap-1 bg-bg p-1.5">
          <span className="bg-surface" />
          <span className="bg-surface" />
          <span className="bg-surface" />
        </div>
      </div>
    )
  }

  if (id === 'studio') {
    return (
      <div
        className={cx(
          'overflow-hidden rounded-lg border',
          selected ? 'border-brand-500' : 'border-border',
        )}
        aria-hidden
      >
        <div className="relative h-20 bg-fg">
          <span className="absolute bottom-2 left-2 h-1.5 w-1/4 bg-surface/80" />
        </div>
        <div className="grid grid-cols-2 gap-1.5 bg-bg p-2">
          <span className="h-8 bg-surface" />
          <span className="h-8 bg-surface" />
        </div>
      </div>
    )
  }

  return (
    <div
      className={cx(
        'overflow-hidden rounded-lg border',
        selected ? 'border-brand-500' : 'border-border',
      )}
      aria-hidden
    >
      <div className="m-1.5 h-12 rounded-md border border-border bg-surface" />
      <div className="mx-1.5 mb-1.5 grid grid-cols-6 gap-1">
        {Array.from({ length: 6 }, (_, i) => (
          <span key={i} className="h-5 rounded-sm border border-border bg-surface" />
        ))}
      </div>
      <div className="mx-1.5 mb-1.5 h-8 rounded-md border border-border bg-surface" />
    </div>
  )
}

export function StorefrontTemplatePicker({
  selected,
  disabled,
  onSelect,
}: {
  selected: StorefrontTemplate
  disabled?: boolean
  onSelect: (template: StorefrontTemplate) => void
}) {
  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-3">
        {STOREFRONT_TEMPLATE_OPTIONS.map((option) => {
          const active = selected === option.id
          return (
            <button
              key={option.id}
              type="button"
              aria-pressed={active}
              disabled={disabled}
              onClick={() => onSelect(option.id)}
              className={cx(
                'flex flex-col gap-3 rounded-card border p-3 text-left transition-colors sm:p-4',
                active ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-border bg-surface text-fg hover:border-brand-500',
                disabled && 'cursor-not-allowed opacity-70',
              )}
            >
              <TemplateMini id={option.id} selected={active} />
              <span>
                <span className={cx('block text-[11px] font-bold uppercase tracking-[0.16em]', active ? 'text-brand-700' : 'text-fg-muted')}>
                  {option.eyebrow}
                </span>
                <span className="mt-1 block font-display text-base font-bold">{option.title}</span>
                <span className={cx('mt-1 block text-sm leading-relaxed', active ? 'text-brand-700' : 'text-fg-muted')}>
                  {option.description}
                </span>
              </span>
            </button>
          )
        })}
      </div>
      {selected !== 'vault' ? (
        <Button
          type="button"
          variant="secondary"
          size="sm"
          disabled={disabled}
          onClick={() => onSelect('vault')}
        >
          <RotateCcw aria-hidden className="size-4" />
          Revert to Vault
        </Button>
      ) : (
        <p className="text-sm text-fg-muted">This is the default boxed shop. Campaign and Studio only change the public home.</p>
      )}
    </div>
  )
}
