import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { api, ApiError } from './api'
import type { User } from '../types'

interface AuthState {
  user: User | null
  token: string | null
  booting: boolean
  login: (email: string, password: string) => Promise<void>
  signup: (name: string, email: string, password: string) => Promise<void>
  logout: () => void
}

const AuthContext = createContext<AuthState | null>(null)

const TOKEN_KEY = 'pp_token'

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(() => localStorage.getItem(TOKEN_KEY))
  const [user, setUser] = useState<User | null>(null)
  const [booting, setBooting] = useState(true)

  // Validate the stored token once on boot; stale tokens are dropped quietly.
  useEffect(() => {
    let cancelled = false
    async function boot() {
      const stored = localStorage.getItem(TOKEN_KEY)
      if (!stored) {
        setBooting(false)
        return
      }
      try {
        const res = await api<{ user: User }>('/api/auth/me', { token: stored })
        if (!cancelled) {
          setUser(res.user)
          setToken(stored)
        }
      } catch {
        if (!cancelled) {
          localStorage.removeItem(TOKEN_KEY)
          setToken(null)
        }
      } finally {
        if (!cancelled) setBooting(false)
      }
    }
    void boot()
    return () => {
      cancelled = true
    }
  }, [])

  const value = useMemo<AuthState>(
    () => ({
      user,
      token,
      booting,
      async login(email, password) {
        const res = await api<{ token: string; user: User }>('/api/auth/login', {
          method: 'POST',
          body: { email, password },
        })
        localStorage.setItem(TOKEN_KEY, res.token)
        setToken(res.token)
        setUser(res.user)
      },
      async signup(name, email, password) {
        const res = await api<{ token: string; user: User }>('/api/auth/signup', {
          method: 'POST',
          body: { name, email, password },
        })
        localStorage.setItem(TOKEN_KEY, res.token)
        setToken(res.token)
        setUser(res.user)
      },
      logout() {
        localStorage.removeItem(TOKEN_KEY)
        setToken(null)
        setUser(null)
      },
    }),
    [user, token, booting],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}

export { ApiError }
