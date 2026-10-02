import '@testing-library/jest-dom/vitest'
import { vi } from 'vitest'

// Components read the session through useAuth; tests run as a fixed operator.
vi.mock('@/auth/AuthContext', async () => {
  const { can } = await import('@/auth/permissions')
  const user = { id: 'u2', email: 'op@x.edu', name: 'Op Erator', role: 'operator' as const }
  return {
    useAuth: () => ({ user, loading: false, login: vi.fn(), logout: vi.fn(), can: (p: Parameters<typeof can>[1]) => can(user.role, p) }),
    AuthProvider: ({ children }: { children: unknown }) => children,
  }
})

// Radix and Recharts rely on browser APIs that jsdom lacks.
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
;(globalThis as unknown as { ResizeObserver: typeof ResizeObserverStub }).ResizeObserver = ResizeObserverStub
if (typeof Element !== 'undefined') {
  Element.prototype.scrollIntoView = () => {}
  Element.prototype.hasPointerCapture = () => false
}
