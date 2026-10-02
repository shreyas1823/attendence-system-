import { Loader2, ShieldAlert } from 'lucide-react'
import { Link, Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from './AuthContext'
import type { Permission } from './permissions'

function FullPageSpinner() {
  return (
    <div className="flex h-screen items-center justify-center" role="status" aria-label="Loading session">
      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
    </div>
  )
}

/** Gate for everything behind login; remembers where the user was heading. */
export function RequireAuth() {
  const { user, loading } = useAuth()
  const location = useLocation()
  if (loading) return <FullPageSpinner />
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />
  return <Outlet />
}

/** Role gate driven by the permission map. Renders a 403 view rather than redirecting silently. */
export function RequirePermission({ permission }: { permission: Permission }) {
  const { can } = useAuth()
  if (!can(permission)) return <Forbidden />
  return <Outlet />
}

export function Forbidden() {
  return (
    <div className="mx-auto flex max-w-sm flex-col items-center gap-2 py-20 text-center">
      <ShieldAlert className="h-8 w-8 text-warning" aria-hidden />
      <h1 className="text-lg font-semibold">Access denied</h1>
      <p className="text-xs text-muted-foreground">Your role does not allow viewing this page.</p>
      <Link to="/dashboard" className="text-xs font-medium text-primary hover:underline">
        Back to dashboard
      </Link>
    </div>
  )
}

/** Hides children when the user lacks the permission (UI affordance only — the API enforces for real). */
export function Can({ permission, children, fallback = null }: { permission: Permission; children: React.ReactNode; fallback?: React.ReactNode }) {
  const { can } = useAuth()
  return <>{can(permission) ? children : fallback}</>
}
