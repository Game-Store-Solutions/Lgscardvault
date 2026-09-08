import { useEffect, useMemo, useState } from 'react'
import { DayPicker, type DateRange } from 'react-day-picker'
import { cx } from '../../lib/cx'
import 'react-day-picker/style.css'
import './date-range-calendar.css'

function parseIsoDate(value: string | undefined): Date | undefined {
  if (!value) return undefined
  const d = new Date(`${value}T12:00:00`)
  return Number.isNaN(d.getTime()) ? undefined : d
}

function toIsoDate(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export interface DateRangeCalendarProps {
  from: string
  to: string
  onChange: (from: string, to: string) => void
  className?: string
}

/**
 * Range calendar built on react-day-picker. Emits YYYY-MM-DD strings that
 * match `resolveDateRange`'s custom From/To parsing.
 */
export function DateRangeCalendar({ from, to, onChange, className }: DateRangeCalendarProps) {
  const [months, setMonths] = useState(1)

  useEffect(() => {
    const mq = window.matchMedia('(min-width: 640px)')
    const sync = () => setMonths(mq.matches ? 2 : 1)
    sync()
    mq.addEventListener('change', sync)
    return () => mq.removeEventListener('change', sync)
  }, [])

  const selected = useMemo<DateRange | undefined>(() => {
    const f = parseIsoDate(from)
    const t = parseIsoDate(to)
    if (!f && !t) return undefined
    return { from: f, to: t }
  }, [from, to])

  const defaultMonth = selected?.from ?? selected?.to ?? new Date()

  function handleSelect(next: DateRange | undefined) {
    if (!next?.from) {
      onChange('', '')
      return
    }
    onChange(toIsoDate(next.from), next.to ? toIsoDate(next.to) : '')
  }

  return (
    <div className={cx('reports-day-picker rounded-xl border border-border bg-surface p-3 sm:p-4', className)}>
      <DayPicker
        mode="range"
        selected={selected}
        onSelect={handleSelect}
        defaultMonth={defaultMonth}
        numberOfMonths={months}
        disabled={{ after: new Date() }}
        showOutsideDays
        className="reports-rdp"
      />
      <p className="mt-3 text-xs text-fg-muted">
        {from && to
          ? `Selected ${from} → ${to}`
          : from
            ? `Start ${from} — pick an end date`
            : 'Click a start date, then an end date'}
      </p>
    </div>
  )
}
