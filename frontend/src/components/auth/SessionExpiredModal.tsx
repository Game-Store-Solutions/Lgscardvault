import { useCallback, useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router'
import { useAuth } from '../../context/AuthContext'
import { Button, Modal } from '../ui'

const COUNTDOWN_SECONDS = 30

/** Overlay when the JWT expires: confirm they're here, then send them to sign in. */
export function SessionExpiredModal() {
  const { sessionExpired, logout } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [secondsLeft, setSecondsLeft] = useState(COUNTDOWN_SECONDS)
  const leaving = useRef(false)

  const onLogin = location.pathname === '/login' || location.pathname.startsWith('/login/')
  const open = sessionExpired && !onLogin

  const goToLogin = useCallback(() => {
    if (leaving.current) return
    leaving.current = true
    const from = `${location.pathname}${location.search}`
    navigate('/login', { replace: true, state: { from, sessionExpired: true } })
    logout()
  }, [location.pathname, location.search, logout, navigate])

  useEffect(() => {
    if (!open) {
      leaving.current = false
      return
    }
    setSecondsLeft(COUNTDOWN_SECONDS)
    const tick = window.setInterval(() => {
      setSecondsLeft((current) => Math.max(0, current - 1))
    }, 1000)
    return () => window.clearInterval(tick)
  }, [open])

  useEffect(() => {
    if (!open) return
    const timer = window.setTimeout(() => goToLogin(), COUNTDOWN_SECONDS * 1000)
    return () => window.clearTimeout(timer)
  }, [open, goToLogin])

  return (
    <Modal
      open={open}
      onClose={goToLogin}
      title="Are you still there?"
      className="max-w-md"
      overlayClassName="z-[90]"
      footer={
        <Button type="button" onClick={goToLogin}>
          Yes, I’m here
        </Button>
      }
    >
      <p className="text-sm leading-relaxed text-fg">
        Your session expired. Sign in again to keep working — we’ll take you to the sign-in page in{' '}
        <span className="font-bold tabular-nums text-fg">{secondsLeft}</span> second
        {secondsLeft === 1 ? '' : 's'}.
      </p>
    </Modal>
  )
}
