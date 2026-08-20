import { forwardRef, useId, useState } from 'react'
import type { InputHTMLAttributes, ReactNode, TextareaHTMLAttributes } from 'react'
import { Eye, EyeOff } from 'lucide-react'
import { twMerge } from 'tailwind-merge'
import { cx } from '../../lib/cx'

const fieldStack = 'flex min-w-0 flex-col gap-1.5'

function Label({ id, children, required }: { id: string; children: ReactNode; required?: boolean }) {
  return (
    <label htmlFor={id} className="text-sm font-bold text-fg">
      {children}
      {required && <span className="text-danger-500"> *</span>}
    </label>
  )
}

function Caption({ id, error, hint }: { id?: string; error?: ReactNode; hint?: ReactNode }) {
  if (error != null) {
    return (
      <p id={id} className="text-xs font-medium text-danger-700">
        {error}
      </p>
    )
  }
  if (hint != null) {
    return (
      <p id={id} className="text-xs text-fg-muted">
        {hint}
      </p>
    )
  }
  return null
}

const controlBase = cx(
  'w-full rounded-[var(--radius-input)] border bg-bg text-fg placeholder:text-fg-muted',
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/30 focus-visible:border-brand-400',
  'disabled:cursor-not-allowed disabled:opacity-60',
)

function controlBorder(hasError?: boolean) {
  return hasError ? 'border-danger-500' : 'border-border'
}

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: ReactNode
  error?: ReactNode
  hint?: ReactNode
  /** Classes for the label + control stack (grow in toolbars with `flex-1`). */
  wrapperClassName?: string
  leading?: ReactNode
  trailing?: ReactNode
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, error, hint, className, wrapperClassName, id, required, type, leading, trailing, ...props },
  ref,
) {
  const generatedId = useId()
  const inputId = id ?? generatedId
  const descId = error || hint ? `${inputId}-desc` : undefined
  const [revealed, setRevealed] = useState(false)
  const isPassword = type === 'password'
  const resolvedType = isPassword && revealed ? 'text' : type
  const showTrailing = Boolean(trailing) || isPassword
  return (
    <div className={twMerge(cx(fieldStack, 'w-full'), wrapperClassName)}>
      {label != null && (
        <Label id={inputId} required={required}>
          {label}
        </Label>
      )}
      <div className="relative">
        {leading ? (
          <span className="pointer-events-none absolute left-3 top-1/2 z-[1] -translate-y-1/2 text-fg-muted">
            {leading}
          </span>
        ) : null}
        <input
          ref={ref}
          id={inputId}
          type={resolvedType}
          required={required}
          aria-invalid={error ? true : undefined}
          aria-describedby={descId}
          className={cx(
            controlBase,
            controlBorder(!!error),
            'h-10 px-3 text-sm',
            leading && 'pl-9',
            showTrailing && 'pr-10',
            className,
          )}
          {...props}
        />
        {trailing ? <span className="absolute right-1.5 top-1/2 -translate-y-1/2">{trailing}</span> : null}
        {isPassword && !trailing && (
          <button
            type="button"
            onClick={() => setRevealed((v) => !v)}
            aria-label={revealed ? 'Hide password' : 'Show password'}
            aria-pressed={revealed}
            tabIndex={-1}
            className="absolute right-1.5 top-1/2 grid size-7 -translate-y-1/2 place-items-center rounded-btn text-fg-muted transition-colors hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
          >
            {revealed ? <EyeOff aria-hidden className="size-4" /> : <Eye aria-hidden className="size-4" />}
          </button>
        )}
      </div>
      <Caption id={descId} error={error} hint={hint} />
    </div>
  )
})

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: ReactNode
  error?: ReactNode
  hint?: ReactNode
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { label, error, hint, className, id, required, rows = 4, ...props },
  ref,
) {
  const generatedId = useId()
  const inputId = id ?? generatedId
  const descId = error || hint ? `${inputId}-desc` : undefined
  return (
    <div className={cx(fieldStack, 'w-full')}>
      {label != null && (
        <Label id={inputId} required={required}>
          {label}
        </Label>
      )}
      <textarea
        ref={ref}
        id={inputId}
        rows={rows}
        required={required}
        aria-invalid={error ? true : undefined}
        aria-describedby={descId}
        className={cx(controlBase, controlBorder(!!error), 'px-3 py-2 text-sm', className)}
        {...props}
      />
      <Caption id={descId} error={error} hint={hint} />
    </div>
  )
})
