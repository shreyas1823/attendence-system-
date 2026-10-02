import { Radio } from 'lucide-react'
import { EmptyState, ErrorState } from '@/components/common/EmptyState'
import { Badge } from '@/components/ui/badge'
import { Card, CardHeader, CardTitle } from '@/components/ui/card'
import { TableSkeleton } from '@/components/ui/skeleton'
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table'
import { useLiveScans } from '@/hooks/queries'
import { formatTime } from '@/lib/format'
import type { LiveScan } from '@/types'

const SLOT: Record<LiveScan['slot'], { label: string; variant: 'success' | 'info' | 'danger' }> = {
  check_in: { label: 'Check-in', variant: 'success' },
  check_out: { label: 'Check-out', variant: 'info' },
  rejected: { label: 'Rejected', variant: 'danger' },
}

export function LiveFeed() {
  const { data, isPending, isError, refetch, isFetching } = useLiveScans()

  return (
    <Card>
      <CardHeader>
        <CardTitle>Live scan activity</CardTitle>
        <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Radio className={isFetching ? 'h-3 w-3 animate-pulse text-success' : 'h-3 w-3'} aria-hidden />
          Updates every 5s
        </span>
      </CardHeader>
      {isError ? (
        <ErrorState onRetry={() => refetch()} />
      ) : (
        <Table>
          <THead>
            <TR className="hover:bg-transparent">
              <TH>Student</TH>
              <TH>Class</TH>
              <TH>Time</TH>
              <TH>Scan</TH>
              <TH>Finger</TH>
            </TR>
          </THead>
          {isPending ? (
            <TableSkeleton rows={6} cols={5} />
          ) : (
            <TBody>
              {data.map((s) => (
                <TR key={s.id}>
                  <TD className="font-medium">{s.student_name}</TD>
                  <TD>{s.class_name}</TD>
                  <TD className="tabular-nums">{formatTime(s.scan_time)}</TD>
                  <TD>
                    <Badge variant={SLOT[s.slot].variant}>{SLOT[s.slot].label}</Badge>
                  </TD>
                  <TD className="text-muted-foreground">Slot {s.finger_slot}</TD>
                </TR>
              ))}
            </TBody>
          )}
        </Table>
      )}
      {data?.length === 0 && <EmptyState title="No scans yet today" description="Scans appear here as soon as a device reports them." />}
    </Card>
  )
}
