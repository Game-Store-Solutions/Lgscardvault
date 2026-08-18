import { useEffect, useRef, useState } from 'react'
import { Link, useLocation } from 'react-router'
import { Bell } from 'lucide-react'
import { motion } from 'framer-motion'
import { useCustomerNotifications, useMarkNotificationRead } from '../../hooks'
import { NotificationList } from './NotificationList'
import { dropdownPanelClass } from '../ui'
import { EASE_PREMIUM } from '../motion'

export function NotificationBell({ slug }: { slug: string }) {
  const location = useLocation()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement | null>(null)

  const { data: notifications = [] } = useCustomerNotifications(slug, Boolean(slug))
  const unread = notifications.filter((notification) => !notification.readAt)
  const badge = unread.length > 99 ? '99+' : String(unread.length)
  const markRead = useMarkNotificationRead(slug)

  useEffect(() => {
    function handlePointerDown(event: MouseEvent) {
      if (!ref.current?.contains(event.target as Node)) setOpen(false)
    }

    document.addEventListener('mousedown', handlePointerDown)
    return () => document.removeEventListener('mousedown', handlePointerDown)
  }, [])

  useEffect(() => {
    setOpen(false)
  }, [location.pathname])

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-label={unread.length > 0 ? `Notifications, ${unread.length} unread` : 'Notifications'}
        aria-haspopup="menu"
        aria-expanded={open}
        title="Notifications"
        className="relative grid size-9 place-items-center rounded-btn border border-border bg-surface text-fg-muted transition-colors hover:text-brand-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 focus-visible:ring-offset-bg"
      >
        <Bell aria-hidden className="size-4" />
        {unread.length > 0 && (
          <>
            <span className="absolute right-1 top-1 size-2 rounded-full bg-danger-600 ring-2 ring-surface" />
            <span className="absolute -right-2 -top-2 grid h-5 min-w-5 place-items-center rounded-full bg-danger-600 px-1.5 text-[0.68rem] font-black leading-none text-white shadow-sm ring-2 ring-surface">
              {badge}
            </span>
          </>
        )}
      </button>

      {open && (
        <motion.div
          initial={{ opacity: 0, y: 6, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.16, ease: EASE_PREMIUM }}
          className={`${dropdownPanelClass} absolute right-0 z-30 mt-2 w-80 max-w-[calc(100vw-2rem)] p-2`}
        >
          <div className="flex items-center justify-between gap-3 px-2 py-2">
            <p className="text-sm font-bold text-fg">Notifications</p>
            <Link to={`/account?section=notifications&store=${slug}`} onClick={() => setOpen(false)} className="text-xs font-bold text-brand-600 hover:underline">
              Account
            </Link>
          </div>
          <NotificationList
            notifications={unread.slice(0, 6)}
            pendingId={markRead.variables}
            onMarkRead={(id) => markRead.mutate(id)}
            compact
          />
        </motion.div>
      )}
    </div>
  )
}
