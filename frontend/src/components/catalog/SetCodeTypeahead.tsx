import { useEffect, useMemo, useRef, useState } from 'react'
import { Input, dropdownItemClass, dropdownPanelClass } from '../ui'
import { cx } from '../../lib/cx'
import { catalogNamesMatch, rankSetSearch, type SetSearchOption } from '../../lib/searchText'

export interface SetCodeTypeaheadProps {
  id?: string
  value: string
  onChange: (value: string) => void
  sets: SetSearchOption[]
  placeholder?: string
  listboxId: string
  ariaLabel?: string
  onEnter?: () => void
  className?: string
}

/** Shared set-code combobox used by Singles add and Search stock. */
export function SetCodeTypeahead({
  id,
  value,
  onChange,
  sets,
  placeholder = 'Set code or name',
  listboxId,
  ariaLabel = 'Matching sets',
  onEnter,
  className,
}: SetCodeTypeaheadProps) {
  const rootRef = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)
  const [index, setIndex] = useState(0)
  const ready = value.trim().length >= 1
  const options = useMemo(() => {
    if (!ready) return []
    return rankSetSearch(sets, value).slice(0, 12)
  }, [ready, sets, value])
  const show = open && ready && options.length > 0

  useEffect(() => {
    setIndex(options.length > 0 ? 0 : -1)
  }, [value, options.length])

  useEffect(() => {
    function onPointerDown(event: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', onPointerDown)
    return () => document.removeEventListener('mousedown', onPointerDown)
  }, [])

  function pick(code: string) {
    onChange(code.toUpperCase())
    setOpen(false)
    setIndex(-1)
  }

  return (
    <div ref={rootRef} className="relative">
      <Input
        id={id}
        value={value}
        autoComplete="off"
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={show}
        aria-controls={listboxId}
        aria-activedescendant={show && index >= 0 ? `${listboxId}-${index}` : undefined}
        onFocus={() => {
          if (options.length > 0) setOpen(true)
        }}
        onChange={(e) => {
          onChange(e.target.value)
          setOpen(true)
        }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown' && options.length > 0) {
            e.preventDefault()
            setOpen(true)
            setIndex((current) => (current + 1) % options.length)
            return
          }
          if (e.key === 'ArrowUp' && options.length > 0) {
            e.preventDefault()
            setOpen(true)
            setIndex((current) => (current <= 0 ? options.length - 1 : current - 1))
            return
          }
          if (e.key === 'Escape') {
            setOpen(false)
            return
          }
          if (e.key === 'Tab' && show) {
            const set = options[index] ?? options[0]
            if (set) pick(set.code)
            return
          }
          if (e.key === 'Enter') {
            if (show) {
              const set = options[index] ?? options[0]
              if (set && !catalogNamesMatch(set.code, value)) {
                e.preventDefault()
                pick(set.code)
                return
              }
              setOpen(false)
            }
            onEnter?.()
          }
        }}
        placeholder={placeholder}
        className={cx('uppercase min-h-11', className)}
      />
      {show ? (
        <ul
          id={listboxId}
          role="listbox"
          aria-label={ariaLabel}
          className={cx(dropdownPanelClass, 'absolute z-30 mt-1.5 max-h-64 w-full overflow-y-auto p-1')}
        >
          {options.map((set, optionIndex) => (
            <li
              key={set.code}
              id={`${listboxId}-${optionIndex}`}
              role="option"
              aria-selected={optionIndex === index}
            >
              <button
                type="button"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => pick(set.code)}
                onMouseEnter={() => setIndex(optionIndex)}
                className={dropdownItemClass({ active: optionIndex === index })}
              >
                <span className="min-w-0 truncate">
                  <span className="font-semibold uppercase">{set.code}</span>
                  {set.name ? <span className="text-fg-muted"> · {set.name}</span> : null}
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}
