import type {
  HTMLAttributes,
  TableHTMLAttributes,
  ThHTMLAttributes,
  TdHTMLAttributes,
  ReactNode,
} from 'react'
import { cx } from '../../lib/cx'

export type TableProps = TableHTMLAttributes<HTMLTableElement>

export function Table({ className, ...props }: TableProps) {
  return (
    <div className="w-full overflow-x-auto">
      <table className={cx('w-full border-collapse text-sm', className)} {...props} />
    </div>
  )
}

export function THead({ className, ...props }: HTMLAttributes<HTMLTableSectionElement>) {
  return <thead className={cx('border-b border-border', className)} {...props} />
}

export function TBody({ className, ...props }: HTMLAttributes<HTMLTableSectionElement>) {
  return <tbody className={cx('divide-y divide-border', className)} {...props} />
}

export function TR({ className, ...props }: HTMLAttributes<HTMLTableRowElement>) {
  return <tr className={cx('hover:bg-bg/60', className)} {...props} />
}

export function TH({ className, ...props }: ThHTMLAttributes<HTMLTableCellElement>) {
  return (
    <th
      scope="col"
      className={cx('px-4 py-2.5 text-left text-eyebrow', className)}
      {...props}
    />
  )
}

export function TD({ className, ...props }: TdHTMLAttributes<HTMLTableCellElement>) {
  return <td className={cx('px-4 py-3 text-fg align-middle', className)} {...props} />
}

export interface EmptyRowProps {
  colSpan: number
  children: ReactNode
  className?: string
}

export function EmptyRow({ colSpan, children, className }: EmptyRowProps) {
  return (
    <tr>
      <td colSpan={colSpan} className={cx('px-4 py-10 text-center text-sm text-fg-muted', className)}>
        {children}
      </td>
    </tr>
  )
}
