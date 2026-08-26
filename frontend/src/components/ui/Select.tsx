import {
  Children,
  Fragment,
  forwardRef,
  isValidElement,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type KeyboardEvent,
  type ReactNode,
} from 'react'
import { createPortal } from 'react-dom'
import { Check, ChevronDown, Search } from 'lucide-react'
import { AnimatePresence, motion } from 'framer-motion'
import { twMerge } from 'tailwind-merge'
import { EASE_PREMIUM } from '../motion'
import { cx } from '../../lib/cx'
import { dropdownItemClass, dropdownPanelClass } from './dropdown'

type Option = {
  value: string
  label: ReactNode
  disabled: boolean
}

export interface SelectProps {
  label?: ReactNode
  error?: ReactNode
  hint?: ReactNode
  wrapperClassName?: string
  className?: string
  id?: string
  name?: string
  value?: string | number | readonly string[]
  defaultValue?: string | number | readonly string[]
  onChange?: (event: ChangeEvent<HTMLSelectElement>) => void
  disabled?: boolean
  required?: boolean
  children?: ReactNode
  autoFocus?: boolean
  'aria-label'?: string
  'data-guide'?: string
}

const SEARCH_AFTER = 8

function optionLabelText(label: ReactNode): string {
  if (label == null || typeof label === 'boolean') return ''
  if (typeof label === 'string' || typeof label === 'number') return String(label)
  if (Array.isArray(label)) return label.map(optionLabelText).join(' ')
  if (isValidElement<{ children?: ReactNode }>(label)) return optionLabelText(label.props.children)
  return ''
}

function flattenOptions(nodes: ReactNode): Option[] {
  const out: Option[] = []
  Children.forEach(nodes, (child) => {
    if (child == null || typeof child === 'boolean') return
    if (!isValidElement(child)) return
    if (child.type === Fragment) {
      out.push(...flattenOptions((child.props as { children?: ReactNode }).children))
      return
    }
    if (child.type === 'option') {
      const props = child.props as { value?: string | number; disabled?: boolean; children?: ReactNode }
      out.push({
        value: props.value == null ? '' : String(props.value),
        label: props.children,
        disabled: Boolean(props.disabled),
      })
    }
  })
  return out
}

function fireChange(onChange: SelectProps['onChange'], name: string | undefined, value: string) {
  if (!onChange) return
  onChange({
    target: { name: name ?? '', value },
    currentTarget: { name: name ?? '', value },
  } as ChangeEvent<HTMLSelectElement>)
}

type PanelPos = {
  top?: number
  bottom?: number
  left: number
  width: number
  maxHeight: number
}

function positionPanel(trigger: HTMLElement): PanelPos {
  const rect = trigger.getBoundingClientRect()
  const margin = 8
  const gap = 6
  const minWidth = Math.max(rect.width, 198)
  const width = Math.min(minWidth, window.innerWidth - margin * 2)
  let left = rect.left
  if (left + width > window.innerWidth - margin) left = window.innerWidth - margin - width
  if (left < margin) left = margin

  const spaceBelow = window.innerHeight - rect.bottom - gap - margin
  const spaceAbove = rect.top - gap - margin
  const preferred = 320
  const openUp = spaceBelow < 168 && spaceAbove > spaceBelow

  if (openUp) {
    return {
      bottom: window.innerHeight - rect.top + gap,
      left,
      width,
      maxHeight: Math.min(preferred, Math.max(128, spaceAbove)),
    }
  }
  return {
    top: rect.bottom + gap,
    left,
    width,
    maxHeight: Math.min(preferred, Math.max(128, spaceBelow)),
  }
}

export const Select = forwardRef<HTMLButtonElement, SelectProps>(function Select(
  {
    label,
    error,
    hint,
    className,
    wrapperClassName,
    id,
    required,
    children,
    value,
    defaultValue,
    onChange,
    disabled,
    name,
    autoFocus,
    'aria-label': ariaLabel,
    'data-guide': dataGuide,
  },
  ref,
) {
  const generatedId = useId()
  const inputId = id ?? generatedId
  const listboxId = `${inputId}-listbox`
  const options = useMemo(() => flattenOptions(children), [children])
  const searchable = options.length >= SEARCH_AFTER

  const isControlled = value !== undefined
  const [uncontrolled, setUncontrolled] = useState(() =>
    defaultValue == null ? (options[0]?.value ?? '') : String(defaultValue),
  )
  const current = String(isControlled ? (value ?? '') : uncontrolled)

  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [highlight, setHighlight] = useState(current)
  const [pos, setPos] = useState<PanelPos | null>(null)

  const triggerRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  const typeaheadRef = useRef({ buffer: '', at: 0 })

  const selected = options.find((option) => option.value === current)
  const selectedIsPlaceholder = selected != null && selected.value === ''
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase()
    if (!needle) return options
    return options.filter((option) => optionLabelText(option.label).toLowerCase().includes(needle))
  }, [options, query])

  const enabled = filtered.filter((option) => !option.disabled)

  const syncPosition = useCallback(() => {
    if (!triggerRef.current) return
    setPos(positionPanel(triggerRef.current))
  }, [])

  useLayoutEffect(() => {
    if (!open) return
    syncPosition()
    const highlighted = filtered.find((option) => option.value === current && !option.disabled) ?? enabled[0]
    setHighlight(highlighted?.value ?? '')
    const frame = requestAnimationFrame(() => {
      if (searchable) searchRef.current?.focus()
      else panelRef.current?.focus()
    })
    return () => cancelAnimationFrame(frame)
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps -- only re-anchor when the menu opens

  useEffect(() => {
    if (!open) return
    function onPointer(event: PointerEvent) {
      const target = event.target as Node
      if (triggerRef.current?.contains(target) || panelRef.current?.contains(target)) return
      setOpen(false)
    }
    function onReposition() {
      syncPosition()
    }
    document.addEventListener('pointerdown', onPointer)
    window.addEventListener('resize', onReposition)
    window.addEventListener('scroll', onReposition, true)
    return () => {
      document.removeEventListener('pointerdown', onPointer)
      window.removeEventListener('resize', onReposition)
      window.removeEventListener('scroll', onReposition, true)
    }
  }, [open, syncPosition])

  useEffect(() => {
    if (!open) setQuery('')
  }, [open])

  useEffect(() => {
    if (!open) return
    const node = panelRef.current?.querySelector<HTMLElement>(`[data-value="${CSS.escape(highlight)}"]`)
    node?.scrollIntoView({ block: 'nearest' })
  }, [highlight, open, filtered])

  function commit(next: string) {
    if (!isControlled) setUncontrolled(next)
    fireChange(onChange, name, next)
    setOpen(false)
    triggerRef.current?.focus()
  }

  function moveHighlight(direction: 1 | -1) {
    if (enabled.length === 0) return
    const index = enabled.findIndex((option) => option.value === highlight)
    const next = enabled[(index < 0 ? 0 : index + direction + enabled.length) % enabled.length]
    setHighlight(next.value)
  }

  function onTriggerKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (disabled) return
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp' || event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      setOpen(true)
      return
    }
    if (event.key.length === 1 && !event.metaKey && !event.ctrlKey && !event.altKey) {
      const now = Date.now()
      const next =
        now - typeaheadRef.current.at < 500 ? typeaheadRef.current.buffer + event.key : event.key
      typeaheadRef.current = { buffer: next, at: now }
      const match = options.find(
        (option) => !option.disabled && optionLabelText(option.label).toLowerCase().startsWith(next.toLowerCase()),
      )
      if (match) {
        if (!isControlled) setUncontrolled(match.value)
        fireChange(onChange, name, match.value)
      }
    }
  }

  function onPanelKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Escape') {
      event.preventDefault()
      setOpen(false)
      triggerRef.current?.focus()
      return
    }
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      moveHighlight(1)
      return
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault()
      moveHighlight(-1)
      return
    }
    if (event.key === 'Home') {
      event.preventDefault()
      if (enabled[0]) setHighlight(enabled[0].value)
      return
    }
    if (event.key === 'End') {
      event.preventDefault()
      if (enabled.length > 0) setHighlight(enabled[enabled.length - 1].value)
      return
    }
    if (event.key === 'Enter' || (event.key === ' ' && !searchable)) {
      event.preventDefault()
      const option = enabled.find((item) => item.value === highlight)
      if (option) commit(option.value)
    }
  }

  const trigger = (
    <div className="relative min-w-0">
      <button
        ref={(node) => {
          triggerRef.current = node
          if (typeof ref === 'function') ref(node)
          else if (ref) ref.current = node
        }}
        id={inputId}
        type="button"
        disabled={disabled}
        autoFocus={autoFocus}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listboxId}
        aria-invalid={error ? true : undefined}
        aria-required={required || undefined}
        aria-label={ariaLabel}
        data-guide={dataGuide}
        onClick={() => {
          if (!disabled) setOpen((currentOpen) => !currentOpen)
        }}
        onKeyDown={onTriggerKeyDown}
        className={twMerge(
          cx(
            'flex h-10 w-full min-w-0 items-center justify-between gap-2 rounded-[var(--radius-input)] border bg-bg px-3 text-left text-sm text-fg',
            'transition-[border-color,box-shadow] duration-200 hover:border-fg/20',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/30 focus-visible:border-brand-400',
            'disabled:cursor-not-allowed disabled:opacity-60',
            error ? 'border-danger-500' : open ? 'border-brand-400' : 'border-border',
          ),
          className,
        )}
      >
        <span className={cx('min-w-0 flex-1 truncate', (!selected || selectedIsPlaceholder) && 'text-fg-muted')}>
          {selected?.label ?? 'Select…'}
        </span>
        <ChevronDown
          aria-hidden
          className={cx('size-4 shrink-0 text-fg-muted transition-transform duration-200', open && 'rotate-180')}
        />
      </button>
      {name || required ? (
        <input type="hidden" name={name} value={current} required={required} />
      ) : null}
    </div>
  )

  const menu =
    typeof document !== 'undefined' &&
    createPortal(
      <AnimatePresence>
        {open && pos ? (
          <motion.div
            ref={panelRef}
            id={listboxId}
            role="listbox"
            tabIndex={searchable ? -1 : 0}
            aria-activedescendant={highlight ? `${inputId}-opt-${highlight}` : undefined}
            initial={{ opacity: 0, y: 6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 4, scale: 0.985 }}
            transition={{ duration: 0.16, ease: EASE_PREMIUM }}
            onKeyDown={onPanelKeyDown}
            style={{
              position: 'fixed',
              top: pos.top,
              bottom: pos.bottom,
              left: pos.left,
              width: pos.width,
              maxHeight: pos.maxHeight,
              zIndex: 70,
            }}
            className={cx(dropdownPanelClass, 'flex flex-col')}
          >
            {searchable && (
              <div className="shrink-0 border-b border-border p-1.5 dark:border-white/10">
                <label className="relative block">
                  <Search aria-hidden className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-fg-muted" />
                  <input
                    ref={searchRef}
                    type="search"
                    value={query}
                    onChange={(event) => {
                      setQuery(event.target.value)
                      const next = options.filter(
                        (option) =>
                          !option.disabled &&
                          optionLabelText(option.label).toLowerCase().includes(event.target.value.trim().toLowerCase()),
                      )
                      if (next[0]) setHighlight(next[0].value)
                    }}
                    placeholder="Filter…"
                    aria-label="Filter options"
                    className="h-9 w-full rounded-lg border-0 bg-bg pl-8 pr-2 text-sm text-fg placeholder:text-fg-muted focus:outline-none focus:ring-2 focus:ring-brand-500/25 dark:bg-white/[0.04]"
                  />
                </label>
              </div>
            )}
            <div className="min-h-0 flex-1 overflow-y-auto p-1">
              {filtered.length === 0 ? (
                <p className="px-2.5 py-3 text-sm text-fg-muted">No matches.</p>
              ) : (
                filtered.map((option, index) => {
                  const isSelected = option.value === current
                  const isActive = option.value === highlight
                  return (
                    <button
                      key={`${option.value}-${index}`}
                      type="button"
                      role="option"
                      id={`${inputId}-opt-${option.value}`}
                      data-value={option.value}
                      aria-selected={isSelected}
                      disabled={option.disabled}
                      onMouseEnter={() => {
                        if (!option.disabled) setHighlight(option.value)
                      }}
                      onClick={() => {
                        if (!option.disabled) commit(option.value)
                      }}
                      className={dropdownItemClass({ active: isActive, selected: isSelected, disabled: option.disabled })}
                    >
                      <span className="min-w-0 flex-1 truncate">{option.label}</span>
                      {isSelected ? <Check aria-hidden className="size-4 shrink-0 text-brand-500" /> : null}
                    </button>
                  )
                })
              )}
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>,
      document.body,
    )

  return (
    <>
      <div className={cx('flex min-w-0 flex-col gap-1.5', wrapperClassName)}>
        {label != null && (
          <label htmlFor={inputId} className="text-sm font-bold text-fg">
            {label}
            {required ? <span className="text-danger-500"> *</span> : null}
          </label>
        )}
        {trigger}
        {error != null ? (
          <p className="text-xs font-medium text-danger-700">{error}</p>
        ) : hint != null ? (
          <p className="text-xs text-fg-muted">{hint}</p>
        ) : null}
      </div>
      {menu}
    </>
  )
})

export default Select
