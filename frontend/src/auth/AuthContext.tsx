import { useQueryClient } from '@tanstack/react-query'
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { onUnauthorized, tokenStore } from '@/api/client'
import { authApi } from '@/api/services'
import type { User } from '@/types'
import { can, type Permission } from './permissions'

interface AuthState {
  user: User | null
  /** true while restoring a session from a stored token */
  loading: boolean
  login: (email: string, password: string) => Promise<User>
  logout: () => Promise<void>
  can: (permission: Permission) => boolean
}

const AuthContext = createContext<AuthState | null>(null)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const qc = useQueryClient()
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState<boolean>(() => !!tokenStore.get())

  // Restore session on first load.
  useEffect(() => {
    if (!tokenStore.get()) return
    authApi
      .me()
      .then(setUser)
      .catch(() => tokenStore.clear())
      .finally(() => setLoading(false))
  }, [])

  // Any 401 from the axios interceptor ends the session.
  useEffect(
    () =>
      onUnauthorized(() => {
        setUser(null)
        qc.clear()
      }),
    [qc],
  )

  const login = useCallback(async (email: string, password: string) => {
    const res = await authApi.login(email, password)
    tokenStore.set(res.access_token)
    setUser(res.user)
    return res.user
  }, [])

  const logout = useCallback(async () => {
    try {
      await authApi.logout()
    } catch {
      /* token may already be invalid — still sign out locally */
    }
    tokenStore.clear()
    setUser(null)
    qc.clear()
  }, [qc])

  const value = useMemo<AuthState>(
    () => ({ user, loading, login, logout, can: (p) => can(user?.role, p) }),
    [user, loading, login, logout],
  )
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
