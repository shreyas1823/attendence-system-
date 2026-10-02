import { ChevronRight } from 'lucide-react'
import { Link, useLocation } from 'react-router-dom'
import { ROUTE_LABELS } from './nav'

export function Breadcrumbs() {
  const segments = useLocation().pathname.split('/').filter(Boolean)
  const crumbs = segments.map((seg, i) => ({
    to: '/' + segments.slice(0, i + 1).join('/'),
    label: ROUTE_LABELS[seg] ?? decodeURIComponent(seg),
  }))

  return (
    <nav aria-label="Breadcrumb" className="min-w-0">
      <ol className="flex items-center gap-1 text-xs text-muted-foreground">
        <li>
          <Link to="/dashboard" className="hover:text-foreground">
            Home
          </Link>
        </li>
        {crumbs.map((c, i) => (
          <li key={c.to} className="flex items-center gap-1">
            <ChevronRight className="h-3 w-3" aria-hidden />
            {i === crumbs.length - 1 ? (
              <span aria-current="page" className="font-medium text-foreground">
                {c.label}
              </span>
            ) : (
              <Link to={c.to} className="hover:text-foreground">
                {c.label}
              </Link>
            )}
          </li>
        ))}
      </ol>
    </nav>
  )
}
