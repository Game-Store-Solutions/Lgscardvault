import { CheckCircle2 } from 'lucide-react'
import type { OrderStatus } from '../../api/types'
import { cx } from '../../lib/cx'
import { ORDER_STATUS_LABELS, ORDER_WORKFLOW, normalizeWorkflowStatus } from '../../lib/orders'

export function OrderWorkflow({ status }: { status: OrderStatus }) {
  const normalized = normalizeWorkflowStatus(status)
  const activeIndex = ORDER_WORKFLOW.indexOf(normalized)
  const isStopped = status === 'cancelled' || status === 'refunded'

  return (
    <div className="grid gap-2">
      <div className="grid grid-cols-4 gap-2">
        {ORDER_WORKFLOW.map((step, index) => {
          const complete = !isStopped && activeIndex >= index
          const current = !isStopped && activeIndex === index
          return (
            <div key={step} className="min-w-0">
              <div
                className={cx(
                  'flex h-2 rounded-full',
                  complete ? 'bg-brand-500' : 'bg-border',
                  current && 'ring-2 ring-brand-500/25',
                )}
              />
              <p className={cx('mt-1 truncate text-[0.68rem] font-bold', complete ? 'text-fg' : 'text-fg-muted')}>
                {ORDER_STATUS_LABELS[step]}
              </p>
            </div>
          )
        })}
      </div>
      {isStopped && (
        <p className="inline-flex items-center gap-1 text-xs font-bold text-fg-muted">
          <CheckCircle2 aria-hidden className="size-3.5" />
          {ORDER_STATUS_LABELS[status]}
        </p>
      )}
    </div>
  )
}
