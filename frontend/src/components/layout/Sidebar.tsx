import { Fingerprint } from 'lucide-react'
import { NavLink } from 'react-router-dom'
import { useAuth } from '@/auth/AuthContext'
import { cn } from '@/lib/utils'
import { NAV } from './nav'

export function Sidebar({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { can } = useAuth()
  return (
    <>
      {open && <div className="fixed inset-0 z-30 bg-black/40 lg:hidden" onClick={onClose} aria-hidden />}
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-40 flex w-56 flex-col border-r bg-card transition-transform lg:sticky lg:top-0 lg:h-screen lg:translate-x-0',
          open ? 'translate-x-0' : '-translate-x-full',
        )}
        aria-label="Primary"
      >
        <div className="flex h-12 items-center gap-2 border-b px-4">
          <div className="rounded-md bg-primary p-1.5 text-primary-foreground">
            <Fingerprint className="h-4 w-4" aria-hidden />
          </div>
          <span className="text-sm font-semibold">Attendance Admin</span>
        </div>
        <nav className="flex-1 space-y-0.5 overflow-y-auto p-2">
          {NAV.filter((n) => can(n.permission)).map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground',
                  isActive && 'bg-accent text-accent-foreground',
                )
              }
            >
              <Icon className="h-4 w-4" aria-hidden />
              {label}
            </NavLink>
          ))}
        </nav>
        <p className="border-t p-3 text-[11px] text-muted-foreground">Postgres is the source of truth.</p>
      </aside>
    </>
  )
}
