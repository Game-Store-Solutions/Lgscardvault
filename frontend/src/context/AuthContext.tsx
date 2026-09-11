/* eslint-disable react-refresh/only-export-components */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { useQueryClient } from '@tanstack/react-query'
import api, { httpStatus } from '../api/client'
import type { UserProfile } from '../api/types'
import { manageableStores } from '../lib/manageableStores'
import { readJwtExpiryMs } from '../lib/jwtExpiry'
import { isKioskModeActive } from '../lib/kioskMode'
import { announceSessionExpired, onSessionExpired, resetSessionExpiry, takeSessionResumeToken } from '../lib/sessionExpiry'

interface AuthContextValue {
  user: UserProfile | null
  token: string | null
  loading: boolean
  /** True after the JWT expires while this tab still had a signed-in user. */
  sessionExpired: boolean
  login: (email: string, password: string) => Promise<UserProfile | null>
  loginWithToken: (token: string) => Promise<UserProfile | null>
  register: (
    email: string,
    password: string,
    displayName: string,
    accountType: 'owner' | 'customer' | 'admin',
    acceptedTerms?: boolean,
    dateOfBirth?: string,
  ) => Promise<void>
  logout: () => void
  /** Mint a fresh JWT from the stashed expired token (Still here?). */
  extendSession: () => Promise<boolean>
  refreshUser: () => Promise<UserProfile | null>
  isSuperAdmin: boolean
  isStoreOwner: boolean
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserProfile | null>(null)
  const [token, setToken] = useState<string | null>(localStorage.getItem('token'))
  const [loading, setLoading] = useState(true)
  const [sessionExpired, setSessionExpired] = useState(false)
  const queryClient = useQueryClient()
  const userRef = useRef<UserProfile | null>(null)
  userRef.current = user

  const refreshUser = useCallback(async (): Promise<UserProfile | null> => {
    if (!localStorage.getItem('token')) {
      setUser(null)
      setLoading(false)
      return null
    }

    try {
      const { data } = await api.get<UserProfile>('/me')
      setUser(data)
      return data
    } catch (error) {
      localStorage.removeItem('token')
      if (httpStatus(error) === 401 && userRef.current) {
        if (isKioskModeActive()) {
          resetSessionExpiry()
          setToken(null)
          setUser(null)
          setSessionExpired(false)
          return null
        }
        announceSessionExpired()
        setToken(null)
        setSessionExpired(true)
        return userRef.current
      }
      setToken(null)
      setUser(null)
      return null
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refreshUser()
  }, [refreshUser])

  useEffect(() => {
    return onSessionExpired(() => {
      if (isKioskModeActive()) {
        // Never force logout / login bounce on a kiosk — clear staff JWT and continue.
        resetSessionExpiry()
        localStorage.removeItem('token')
        setToken(null)
        setUser(null)
        setSessionExpired(false)
        return
      }
      if (!userRef.current) {
        resetSessionExpiry()
        return
      }
      localStorage.removeItem('token')
      setToken(null)
      setSessionExpired(true)
      void queryClient.cancelQueries()
    })
  }, [queryClient])

  useEffect(() => {
    if (!token) return
    const expiresAt = readJwtExpiryMs(token)
    if (expiresAt == null) return
    const wait = Math.max(0, expiresAt - Date.now())
    const timer = window.setTimeout(() => {
      if (isKioskModeActive()) {
        resetSessionExpiry()
        localStorage.removeItem('token')
        setToken(null)
        setUser(null)
        setSessionExpired(false)
        return
      }
      announceSessionExpired()
    }, wait)
    return () => window.clearTimeout(timer)
  }, [token])

  // Wipe every cached query when the identity changes, so one user never sees
  // data fetched for another (the store-admin, inventory, orders and import
  // caches are all keyed by store slug and would otherwise leak across a
  // logout → login in the same tab).
  const startFreshSession = useCallback((nextToken: string, options?: { clearCache?: boolean }) => {
    if (options?.clearCache !== false) {
      queryClient.clear()
    }
    resetSessionExpiry()
    setSessionExpired(false)
    localStorage.setItem('token', nextToken)
    setToken(nextToken)
  }, [queryClient])

  const login = useCallback(async (email: string, password: string) => {
    const { data } = await api.post<{ token: string }>('/login', { email, password })
    startFreshSession(data.token)
    return refreshUser()
  }, [refreshUser, startFreshSession])

  // Adopt a token minted elsewhere (e.g. the SSO callback redirect).
  const loginWithToken = useCallback(async (nextToken: string) => {
    startFreshSession(nextToken)
    return refreshUser()
  }, [refreshUser, startFreshSession])

  /** Resume after JWT expiry without a password — keeps React Query cache. */
  const extendSession = useCallback(async (): Promise<boolean> => {
    const resume = takeSessionResumeToken()
    if (!resume) {
      return false
    }
    try {
      const { data } = await api.post<{ token: string }>('/auth/extend-session', { token: resume })
      startFreshSession(data.token, { clearCache: false })
      await refreshUser()
      return true
    } catch {
      return false
    }
  }, [refreshUser, startFreshSession])

  const register = useCallback(async (
    email: string,
    password: string,
    displayName: string,
    accountType: 'owner' | 'customer' | 'admin',
    acceptedTerms = false,
    dateOfBirth = '',
  ) => {
    await api.post('/register', { email, password, displayName, accountType, acceptedTerms, dateOfBirth })
  }, [])

  const logout = useCallback(() => {
    resetSessionExpiry()
    setSessionExpired(false)
    localStorage.removeItem('token')
    setToken(null)
    setUser(null)
    queryClient.clear()
  }, [queryClient])

  const value = useMemo(
    () => ({
      user,
      token,
      loading,
      sessionExpired,
      login,
      loginWithToken,
      register,
      logout,
      extendSession,
      refreshUser,
      // Kiosk terminals are always customer-facing — never report staff roles.
      isSuperAdmin: isKioskModeActive() ? false : (user?.roles.includes('ROLE_SUPER_ADMIN') ?? false),
      isStoreOwner: isKioskModeActive()
        ? false
        : (user?.roles.includes('ROLE_STORE_OWNER') ?? false) || manageableStores(user).length > 0,
    }),
    [user, token, loading, sessionExpired, login, loginWithToken, register, logout, extendSession, refreshUser],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider')
  }
  return context
}
