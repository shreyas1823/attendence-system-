import { useDashboardSummary } from '@/hooks/queries'
import { cn } from '@/lib/utils'

/** Live indicator: API reachability (summary poll succeeds) + device heartbeat coverage. */
export function SystemStatus() {
  const { data, isError, isPending } = useDashboardSummary()

  const api = isPending ? 'checking' : isError ? 'down' : 'up'
  const devicesOk = data ? data.devices_online === data.devices_total : true

  const dot = (tone: string) => <span className={cn('inline-block h-2 w-2 rounded-full', tone)} aria-hidden />

  return (
    <div className="hidden items-center gap-3 text-xs text-muted-foreground sm:flex" role="status" aria-live="polite">
      <span className="flex items-center gap-1.5" title="API connectivity">
        {dot(api === 'up' ? 'bg-success' : api === 'down' ? 'bg-destructive' : 'animate-pulse bg-warning')}
        API {api === 'up' ? 'connected' : api === 'down' ? 'unreachable' : 'checking…'}
      </span>
      {data && (
        <span className="flex items-center gap-1.5" title="Devices with a recent heartbeat">
          {dot(devicesOk ? 'bg-success' : 'bg-warning')}
          Devices {data.devices_online}/{data.devices_total}
        </span>
      )}
    </div>
  )
}
