/* eslint-disable react-refresh/only-export-components */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { useQueryClient } from '@tanstack/react-query'
import api from '../api/client'
import type { UserProfile } from '../api/types'
import { manageableStores } from '../lib/manageableStores'

interface AuthContextValue {
  user: UserProfile | null
  token: string | null
  loading: boolean
  login: (email: string, password: string) => Promise<UserProfile | null>
  loginWithToken: (token: string) => Promise<UserProfile | null>
  register: (
    email: string,
    password: string,
    displayName: string,
    accountType: 'owner' | 'customer' | 'admin',
  ) => Promise<void>
  logout: () => void
  refreshUser: () => Promise<UserProfile | null>
  isSuperAdmin: boolean
  isStoreOwner: boolean
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserProfile | null>(null)
  const [token, setToken] = useState<string | null>(localStorage.getItem('token'))
  const [loading, setLoading] = useState(true)
  const queryClient = useQueryClient()

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
    } catch {
      localStorage.removeItem('token')
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

  // Wipe every cached query when the identity changes, so one user never sees
  // data fetched for another (the store-admin, inventory, orders and import
  // caches are all keyed by store slug and would otherwise leak across a
  // logout → login in the same tab).
  const startFreshSession = useCallback((nextToken: string) => {
    queryClient.clear()
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

  const register = useCallback(async (
    email: string,
    password: string,
    displayName: string,
    accountType: 'owner' | 'customer' | 'admin',
  ) => {
    await api.post('/register', { email, password, displayName, accountType })
    await login(email, password)
  }, [login])

  const logout = useCallback(() => {
    localStorage.removeItem('token')
    setToken(null)
    setUser(null)
    // Drop all cached queries so the next user starts from a clean slate.
    queryClient.clear()
  }, [queryClient])

  const value = useMemo(
    () => ({
      user,
      token,
      loading,
      login,
      loginWithToken,
      register,
      logout,
      refreshUser,
      isSuperAdmin: user?.roles.includes('ROLE_SUPER_ADMIN') ?? false,
      isStoreOwner:
        (user?.roles.includes('ROLE_STORE_OWNER') ?? false) ||
        manageableStores(user).length > 0,
    }),
    [user, token, loading, login, loginWithToken, register, logout, refreshUser],
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
