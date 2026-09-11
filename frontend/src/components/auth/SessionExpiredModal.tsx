import { useCallback, useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router'
import { useAuth } from '../../context/AuthContext'
import { useKioskMode } from '../../hooks'
import { Button, Modal } from '../ui'

const COUNTDOWN_SECONDS = 30

/** Overlay when the JWT expires: confirm they're here, then mint a fresh token. */
export function SessionExpiredModal() {
  const { sessionExpired, logout, extendSession } = useAuth()
  const { kioskMode } = useKioskMode()
  const navigate = useNavigate()
  const location = useLocation()
  const [secondsLeft, setSecondsLeft] = useState(COUNTDOWN_SECONDS)
  const [extending, setExtending] = useState(false)
  const [extendError, setExtendError] = useState<string | null>(null)
  const leaving = useRef(false)

  const onLogin = location.pathname === '/login' || location.pathname.startsWith('/login/')
  // Kiosk terminals are customer-facing — never interrupt with auth prompts.
  const open = sessionExpired && !onLogin && !kioskMode

  const goToLogin = useCallback(() => {
    if (leaving.current) return
    leaving.current = true
    const from = `${location.pathname}${location.search}`
    navigate('/login', { replace: true, state: { from, sessionExpired: true } })
    logout()
  }, [location.pathname, location.search, logout, navigate])

  const staySignedIn = useCallback(async () => {
    if (leaving.current || extending) return
    setExtending(true)
    setExtendError(null)
    const ok = await extendSession()
    setExtending(false)
    if (ok) {
      leaving.current = false
      return
    }
    setExtendError('Could not renew your session. Please sign in again.')
    window.setTimeout(() => goToLogin(), 1200)
  }, [extendSession, extending, goToLogin])

  useEffect(() => {
    if (!open) {
      leaving.current = false
      setExtending(false)
      setExtendError(null)
      return
    }
    setSecondsLeft(COUNTDOWN_SECONDS)
    const tick = window.setInterval(() => {
      setSecondsLeft((current) => Math.max(0, current - 1))
    }, 1000)
    return () => window.clearInterval(tick)
  }, [open])

  useEffect(() => {
    if (!open || extending) return
    const timer = window.setTimeout(() => goToLogin(), COUNTDOWN_SECONDS * 1000)
    return () => window.clearTimeout(timer)
  }, [open, goToLogin, extending])

  return (
    <Modal
      open={open}
      onClose={goToLogin}
      title="Are you still there?"
      className="max-w-md"
      overlayClassName="z-[90]"
      footer={
        <div className="flex flex-wrap items-center justify-end gap-2">
          <Button type="button" variant="ghost" disabled={extending} onClick={goToLogin}>
            Sign in again
          </Button>
          <Button type="button" loading={extending} onClick={() => void staySignedIn()}>
            Yes, I’m here
          </Button>
        </div>
      }
    >
      <p className="text-sm leading-relaxed text-fg">
        Your session timed out. Confirm you’re still here to keep working — otherwise we’ll sign you out in{' '}
        <span className="font-bold tabular-nums text-fg">{secondsLeft}</span> second
        {secondsLeft === 1 ? '' : 's'}.
      </p>
      {extendError ? (
        <p className="mt-3 text-sm font-medium text-danger-700" role="alert">
          {extendError}
        </p>
      ) : null}
    </Modal>
  )
}
