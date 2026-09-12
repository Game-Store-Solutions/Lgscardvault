import { useEffect, useMemo, useRef, useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { Input, dropdownItemClass, dropdownPanelClass } from '../ui'
import { cx } from '../../lib/cx'
import { catalogNamesMatch, foldSearchText, rankSetSearch, type SetSearchOption } from '../../lib/searchText'

const ROW_HEIGHT = 36
const VIEWPORT = 288
const OVERSCAN = 8
const WINDOW_AFTER = 40

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
  emptyLabel?: string
  /** Hide the empty “Any set” row — used when a set must be chosen. */
  required?: boolean
}

function visibleSetWindow(count: number, scrollTop: number, headerHeight: number) {
  if (count <= WINDOW_AFTER) return { start: 0, end: count }
  const start = Math.max(0, Math.floor(Math.max(0, scrollTop - headerHeight) / ROW_HEIGHT) - OVERSCAN)
  const end = Math.min(count, start + Math.ceil(VIEWPORT / ROW_HEIGHT) + OVERSCAN * 2)
  return { start, end }
}

/** Searchable set combobox: type to filter, or open the full list. */
export function SetCodeTypeahead({
  id,
  value,
  onChange,
  sets,
  placeholder = 'Type or browse sets',
  listboxId,
  ariaLabel = 'Sets',
  onEnter,
  className,
  emptyLabel = 'Any set',
  required = false,
}: SetCodeTypeaheadProps) {
  const rootRef = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLUListElement>(null)
  const [open, setOpen] = useState(false)
  const [index, setIndex] = useState(-1)
  const [scrollTop, setScrollTop] = useState(0)
  const browsing = value.trim().length === 0
  const allowEmpty = browsing && !required
  const options = useMemo(() => (open ? rankSetSearch(sets, value) : []), [open, sets, value])
  const show = open
  const windowed = options.length > WINDOW_AFTER
  const windowRange = useMemo(
    () => visibleSetWindow(options.length, scrollTop, allowEmpty ? ROW_HEIGHT : 0),
    [allowEmpty, options.length, scrollTop],
  )
  const visible = windowed ? options.slice(windowRange.start, windowRange.end) : options

  useEffect(() => {
    if (!open) {
      setScrollTop(0)
      setIndex(-1)
      return
    }
    if (allowEmpty) {
      setIndex(-1)
      return
    }
    const selected = options.findIndex((set) => foldSearchText(set.code) === foldSearchText(value))
    setIndex(selected >= 0 ? selected : options.length > 0 ? 0 : -1)
  }, [allowEmpty, browsing, open, options, value])

  useEffect(() => {
    const list = listRef.current
    if (!show || index < 0 || !list) return
    const top = index * ROW_HEIGHT + (allowEmpty ? ROW_HEIGHT : 0)
    if (top < list.scrollTop) list.scrollTop = top
    else if (top + ROW_HEIGHT > list.scrollTop + list.clientHeight) {
      list.scrollTop = top + ROW_HEIGHT - list.clientHeight
    }
  }, [allowEmpty, browsing, index, show])

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
    onChange(code ? code.toUpperCase() : '')
    setOpen(false)
    setIndex(-1)
  }

  function highlightedSet() {
    return index >= 0 ? (options[index] ?? null) : null
  }

  function moveHighlight(delta: number) {
    if (options.length === 0) {
      setIndex(-1)
      return
    }
    setIndex((current) => {
      const min = allowEmpty ? -1 : 0
      const next = current + delta
      if (next < min) return options.length - 1
      if (next >= options.length) return min
      return next
    })
  }

  function commitKeyboard(kind: 'enter' | 'tab') {
    const set = highlightedSet()
    if (set && (kind === 'tab' || !catalogNamesMatch(set.code, value))) {
      pick(set.code)
      return
    }
    setOpen(false)
    if (kind === 'enter') onEnter?.()
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
        aria-activedescendant={show && index >= 0 ? `${listboxId}-${index}` : show && allowEmpty ? `${listboxId}-any` : undefined}
        onFocus={() => setOpen(true)}
        onChange={(e) => {
          onChange(e.target.value)
          setOpen(true)
        }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown' && (options.length > 0 || allowEmpty)) {
            e.preventDefault()
            setOpen(true)
            moveHighlight(1)
            return
          }
          if (e.key === 'ArrowUp' && (options.length > 0 || allowEmpty)) {
            e.preventDefault()
            setOpen(true)
            moveHighlight(-1)
            return
          }
          if (e.key === 'Escape') {
            setOpen(false)
            return
          }
          if (e.key === 'Tab' && show) {
            commitKeyboard('tab')
            return
          }
          if (e.key === 'Enter') {
            e.preventDefault()
            if (show) commitKeyboard('enter')
            else onEnter?.()
          }
        }}
        placeholder={placeholder}
        className={cx('uppercase min-h-11 pr-10', className)}
      />
      <button
        type="button"
        tabIndex={-1}
        aria-label="Browse sets"
        aria-expanded={show}
        aria-controls={listboxId}
        onMouseDown={(event) => {
          event.preventDefault()
          setOpen((current) => !current)
        }}
        className="absolute right-1.5 top-1/2 grid size-7 -translate-y-1/2 place-items-center rounded-btn text-fg-muted transition-colors hover:text-fg"
      >
        <ChevronDown aria-hidden className={cx('size-4 transition-transform', show && 'rotate-180')} />
      </button>
      {show ? (
        <ul
          ref={listRef}
          id={listboxId}
          role="listbox"
          aria-label={ariaLabel}
          onScroll={windowed ? (event) => setScrollTop(event.currentTarget.scrollTop) : undefined}
          className={cx(dropdownPanelClass, 'absolute z-30 mt-1.5 max-h-72 w-full overflow-y-auto p-1')}
        >
          {allowEmpty ? (
            <li id={`${listboxId}-any`} role="option" aria-selected={index < 0} className="sticky top-0 z-10 bg-surface">
              <button
                type="button"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => pick('')}
                className={dropdownItemClass({ active: index < 0, selected: !value.trim() })}
              >
                <span className="text-fg-muted">{emptyLabel}</span>
              </button>
            </li>
          ) : null}
          {options.length === 0 ? (
            browsing ? null : <li className="px-2.5 py-2 text-sm text-fg-muted">No matching sets</li>
          ) : (
            <>
              {windowed ? <li aria-hidden className="pointer-events-none" style={{ height: windowRange.start * ROW_HEIGHT }} /> : null}
              {visible.map((set, offset) => {
                const optionIndex = windowed ? windowRange.start + offset : offset
                const selected = foldSearchText(set.code) === foldSearchText(value)
                return (
                  <li
                    key={set.code}
                    id={`${listboxId}-${optionIndex}`}
                    role="option"
                    aria-selected={optionIndex === index}
                    style={{ height: ROW_HEIGHT }}
                  >
                    <button
                      type="button"
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => pick(set.code)}
                      onMouseEnter={() => setIndex(optionIndex)}
                      className={dropdownItemClass({ active: optionIndex === index, selected })}
                    >
                      <span className="min-w-0 truncate">
                        <span className="font-semibold uppercase">{set.code}</span>
                        {set.name ? <span className="text-fg-muted"> · {set.name}</span> : null}
                      </span>
                    </button>
                  </li>
                )
              })}
              {windowed ? (
                <li aria-hidden className="pointer-events-none" style={{ height: (options.length - windowRange.end) * ROW_HEIGHT }} />
              ) : null}
            </>
          )}
        </ul>
      ) : null}
    </div>
  )
}
