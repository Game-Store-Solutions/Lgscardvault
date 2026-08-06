import { CreditCard } from 'lucide-react'
import { cx } from '../../lib/cx'

/** Small visual hint for saved payment brand (Square returns brand strings like VISA). */
export function PaymentBrandMark({ brand, className }: { brand?: string | null; className?: string }) {
  const key = (brand ?? '').toLowerCase().replace(/\s+/g, '')

  if (key.includes('visa')) {
    return (
      <span
        className={cx(
          'flex size-11 shrink-0 items-center justify-center rounded-btn bg-[#1a1f71] font-display text-[11px] font-black tracking-wider text-white',
          className,
        )}
        aria-hidden
      >
        VISA
      </span>
    )
  }

  if (key.includes('master')) {
    return (
      <span
        className={cx('relative flex size-11 shrink-0 items-center justify-center rounded-btn bg-[#1a1a1a]', className)}
        aria-hidden
      >
        <span className="absolute left-2.5 size-5 rounded-full bg-[#eb001b]/90" />
        <span className="absolute right-2.5 size-5 rounded-full bg-[#f79e1b]/90" />
      </span>
    )
  }

  if (key.includes('amex') || key.includes('american')) {
    return (
      <span
        className={cx(
          'flex size-11 shrink-0 items-center justify-center rounded-btn bg-[#006fcf] font-display text-[10px] font-black text-white',
          className,
        )}
        aria-hidden
      >
        AMEX
      </span>
    )
  }

  if (key.includes('discover')) {
    return (
      <span
        className={cx(
          'flex size-11 shrink-0 items-center justify-center rounded-btn bg-[#ff6000] font-display text-[9px] font-black text-white',
          className,
        )}
        aria-hidden
      >
        DISC
      </span>
    )
  }

  return (
    <span
      className={cx(
        'relative flex size-11 shrink-0 items-center justify-center overflow-hidden rounded-btn bg-gradient-to-br from-slate-600 to-slate-800 text-white',
        className,
      )}
      aria-hidden
    >
      <span className="absolute left-1.5 top-2 h-3 w-4 rounded-[2px] bg-amber-200/90" />
      <CreditCard className="relative size-5 opacity-90" />
    </span>
  )
}
