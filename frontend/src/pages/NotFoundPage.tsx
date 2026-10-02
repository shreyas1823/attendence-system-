import { Link } from 'react-router-dom'

export default function NotFoundPage() {
  return (
    <div className="mx-auto flex max-w-sm flex-col items-center gap-2 py-20 text-center">
      <p className="text-3xl font-semibold">404</p>
      <p className="text-xs text-muted-foreground">That page doesn't exist.</p>
      <Link to="/dashboard" className="text-xs font-medium text-primary hover:underline">
        Back to dashboard
      </Link>
    </div>
  )
}
