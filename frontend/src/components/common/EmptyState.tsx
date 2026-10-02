import type { LucideIcon } from 'lucide-react'
import { Inbox } from 'lucide-react'

interface Props {
  title: string
  description?: string
  icon?: LucideIcon
  action?: React.ReactNode
}

export function EmptyState({ title, description, icon: Icon = Inbox, action }: Props) {
  return (
    <div className="flex flex-col items-center justify-center gap-1.5 px-4 py-10 text-center">
      <div className="mb-1 rounded-full bg-muted p-2.5">
        <Icon className="h-5 w-5 text-muted-foreground" aria-hidden />
      </div>
      <p className="text-sm font-medium">{title}</p>
      {description && <p className="max-w-sm text-xs text-muted-foreground">{description}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  )
}

export function ErrorState({ message, onRetry }: { message?: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="flex flex-col items-center gap-2 px-4 py-8 text-center">
      <p className="text-sm font-medium text-destructive">Something went wrong</p>
      <p className="text-xs text-muted-foreground">{message ?? 'The request failed. Please try again.'}</p>
      {onRetry && (
        <button className="text-xs font-medium text-primary hover:underline" onClick={onRetry}>
          Retry
        </button>
      )}
    </div>
  )
}
