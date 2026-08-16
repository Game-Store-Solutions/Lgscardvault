import { useId } from 'react'
import type { ReactNode } from 'react'
import { cx } from '../../lib/cx'

export interface FieldProps {
  label?: ReactNode
  hint?: ReactNode
  error?: ReactNode
  htmlFor?: string
  required?: boolean
  className?: string
  /**
   * Render-prop receiving the generated control id so a custom control can wire
   * up `id` (and aria) correctly. If you pass plain children instead, the id is
   * still applied to the <label htmlFor>.
   */
  children: ReactNode | ((ids: { id: string; describedBy?: string }) => ReactNode)
}

export function Field({
  label,
  hint,
  error,
  htmlFor,
  required,
  className,
  children,
}: FieldProps) {
  const generatedId = useId()
  const id = htmlFor ?? generatedId
  const describedById = hint || error ? `${id}-desc` : undefined

  return (
    <div className={cx('flex w-full min-w-0 flex-col gap-1.5', className)}>
      {label != null && (
        <label htmlFor={id} className="text-sm font-bold text-fg">
          {label}
          {required && <span className="text-danger-500"> *</span>}
        </label>
      )}
      {typeof children === 'function' ? children({ id, describedBy: describedById }) : children}
      {error != null ? (
        <p id={describedById} className="text-xs font-medium text-danger-700">
          {error}
        </p>
      ) : (
        hint != null && (
          <p id={describedById} className="text-xs text-fg-muted">
            {hint}
          </p>
        )
      )}
    </div>
  )
}
