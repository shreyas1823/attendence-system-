import type { LucideIcon } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'

interface Props {
  label: string
  value: React.ReactNode
  hint?: string
  icon: LucideIcon
  tone?: 'default' | 'success' | 'danger' | 'warning'
  loading?: boolean
}

const TONES = {
  default: 'bg-accent text-accent-foreground',
  success: 'bg-success/10 text-success',
  danger: 'bg-destructive/10 text-destructive',
  warning: 'bg-warning/10 text-warning',
}

export function KpiCard({ label, value, hint, icon: Icon, tone = 'default', loading }: Props) {
  return (
    <Card className="flex items-start justify-between gap-3 p-4">
      <div className="min-w-0 space-y-1">
        <p className="text-xs font-medium text-muted-foreground">{label}</p>
        {loading ? (
          <Skeleton className="h-7 w-20" />
        ) : (
          <p className="text-2xl font-semibold tabular-nums leading-tight">{value}</p>
        )}
        {loading ? <Skeleton className="h-3 w-28" /> : hint && <p className="truncate text-xs text-muted-foreground">{hint}</p>}
      </div>
      <div className={cn('rounded-md p-2', TONES[tone])}>
        <Icon className="h-4 w-4" aria-hidden />
      </div>
    </Card>
  )
}
