import { cx } from '../../lib/cx'

/**
 * Shared chrome for every floating menu: custom selects, header account
 * menus, notification trays. One surface so the app doesn't grow a zoo of
 * slightly different panels.
 */
export const dropdownPanelClass = cx(
  'overflow-hidden rounded-xl border border-border bg-surface',
  'shadow-[0_16px_48px_-16px_rgba(10,10,11,0.28),0_0_0_1px_rgba(10,10,11,0.03)]',
  'dark:border-white/10 dark:bg-[#171717]',
  'dark:shadow-[0_20px_56px_-16px_rgba(0,0,0,0.72),0_0_0_1px_rgba(255,255,255,0.04)]',
)

export const dropdownItemClass = ({
  active,
  selected,
  disabled,
}: {
  active?: boolean
  selected?: boolean
  disabled?: boolean
}) =>
  cx(
    'flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm transition-colors',
    disabled && 'cursor-not-allowed opacity-40',
    !disabled && active && 'bg-bg text-fg dark:bg-white/[0.07]',
    !disabled && !active && 'text-fg hover:bg-bg dark:hover:bg-white/[0.05]',
    selected && 'font-semibold',
  )
