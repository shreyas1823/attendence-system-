import axios, { AxiosError, type InternalAxiosRequestConfig } from 'axios'
import type { ApiError } from '@/types'
import { mockAdapter } from './mock/adapter'

const TOKEN_KEY = 'attendance.access_token'

// Held in memory first; sessionStorage only survives reloads within the tab.
let memoryToken: string | null = null

export const tokenStore = {
  get(): string | null {
    if (memoryToken) return memoryToken
    try {
      memoryToken = sessionStorage.getItem(TOKEN_KEY)
    } catch {
      /* storage unavailable (private mode / SSR) */
    }
    return memoryToken
  },
  set(token: string) {
    memoryToken = token
    try {
      sessionStorage.setItem(TOKEN_KEY, token)
    } catch {
      /* ignore */
    }
  },
  clear() {
    memoryToken = null
    try {
      sessionStorage.removeItem(TOKEN_KEY)
    } catch {
      /* ignore */
    }
  },
}

type UnauthorizedListener = () => void
const listeners = new Set<UnauthorizedListener>()
/** AuthProvider subscribes so a 401 anywhere logs the user out and routes to /login. */
export const onUnauthorized = (fn: UnauthorizedListener) => {
  listeners.add(fn)
  return () => {
    listeners.delete(fn)
  }
}

export const USE_MOCK = import.meta.env.VITE_USE_MOCK === 'true'

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL ?? '/api/v1',
  timeout: 15_000,
  ...(USE_MOCK ? { adapter: mockAdapter } : {}),
})

api.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const token = tokenStore.get()
  if (token) config.headers.set('Authorization', `Bearer ${token}`)
  return config
})

api.interceptors.response.use(
  (res) => res,
  (error: AxiosError<ApiError>) => {
    const isLogin = error.config?.url?.includes('/auth/login')
    if (error.response?.status === 401 && !isLogin) {
      tokenStore.clear()
      listeners.forEach((fn) => fn())
    }
    return Promise.reject(error)
  },
)

/** Normalises any thrown value into a user-facing message for toasts and forms. */
export function errorMessage(err: unknown, fallback = 'Something went wrong'): string {
  if (axios.isAxiosError<ApiError>(err)) {
    return err.response?.data?.message ?? (err.code === 'ERR_NETWORK' ? 'Cannot reach the server' : err.message)
  }
  return err instanceof Error ? err.message : fallback
}
