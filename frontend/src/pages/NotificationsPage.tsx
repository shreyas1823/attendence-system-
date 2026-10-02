import { MessageSquareOff, RotateCw } from 'lucide-react'
import { Fragment, useState } from 'react'
import { Can } from '@/auth/guards'
import { EmptyState, ErrorState } from '@/components/common/EmptyState'
import { PageHeader } from '@/components/common/PageHeader'
import { Pagination } from '@/components/common/Pagination'
import { NotificationBadge } from '@/components/common/StatusBadge'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardHeader, CardTitle } from '@/components/ui/card'
import { Select } from '@/components/ui/form'
import { TableSkeleton } from '@/components/ui/skeleton'
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table'
import { useAbsenceRuns, useNotifications, useOutboxStatus, useRetryNotification } from '@/hooks/queries'
import { formatDateTime } from '@/lib/format'
import type { NotificationStatus } from '@/types'

export default function NotificationsPage() {
  const [status, setStatus] = useState<NotificationStatus | ''>('')
  const [page, setPage] = useState(1)
  const [retryingId, setRetryingId] = useState<string | null>(null)

  const runs = useAbsenceRuns()
  const outbox = useOutboxStatus()
  const ledger = useNotifications({ page, status })
  const retry = useRetryNotification()

  return (
    <>
      <PageHeader
        title="Notifications"
        description="End-of-day absence batches and WhatsApp delivery to parents."
        actions={
          outbox.data && (
            <>
              <Badge variant="warning">{outbox.data.whatsapp_pending} WhatsApp pending</Badge>
              <Badge variant={outbox.data.failed ? 'danger' : 'default'}>{outbox.data.failed} failed jobs</Badge>
            </>
          )
        }
      />

      <div className="grid gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-1">
          <CardHeader>
            <CardTitle>Absence runs</CardTitle>
          </CardHeader>
          {runs.isError ? (
            <ErrorState onRetry={() => runs.refetch()} />
          ) : (
            <Table>
              <THead>
                <TR className="hover:bg-transparent">
                  <TH>Date</TH>
                  <TH>Absent</TH>
                  <TH>Sent</TH>
                  <TH>Failed</TH>
                </TR>
              </THead>
              {runs.isPending ? (
                <TableSkeleton rows={5} cols={4} />
              ) : (
                <TBody>
                  {runs.data.map((r) => (
                    <TR key={r.id} title={r.notification_triggered_at ? `Triggered ${formatDateTime(r.notification_triggered_at)}` : 'Not triggered'}>
                      <TD className="tabular-nums">{r.run_date}</TD>
                      <TD className="tabular-nums">{r.total_absent}</TD>
                      <TD className="tabular-nums text-success">{r.sent}</TD>
                      <TD className={r.failed ? 'tabular-nums font-medium text-destructive' : 'tabular-nums text-muted-foreground'}>{r.failed}</TD>
                    </TR>
                  ))}
                </TBody>
              )}
            </Table>
          )}
          {runs.data?.length === 0 && <EmptyState title="No runs yet" description="The first run happens after attendance closes for the day." />}
        </Card>

        <Card className="xl:col-span-2">
          <CardHeader>
            <CardTitle>Delivery ledger</CardTitle>
            <Select
              className="w-36"
              aria-label="Filter by status"
              value={status}
              onChange={(e) => {
                setStatus(e.target.value as NotificationStatus | '')
                setPage(1)
              }}
            >
              <option value="">All statuses</option>
              <option value="queued">Queued</option>
              <option value="sent">Sent</option>
              <option value="delivered">Delivered</option>
              <option value="failed">Failed</option>
            </Select>
          </CardHeader>
          {ledger.isError ? (
            <ErrorState onRetry={() => ledger.refetch()} />
          ) : (
            <Table>
              <THead>
                <TR className="hover:bg-transparent">
                  <TH>Student</TH>
                  <TH>Parent</TH>
                  <TH>Queued</TH>
                  <TH>Status</TH>
                  <TH className="text-right">Action</TH>
                </TR>
              </THead>
              {ledger.isPending ? (
                <TableSkeleton rows={8} cols={5} />
              ) : (
                <TBody>
                  {ledger.data.data.map((n) => (
                    <Fragment key={n.id}>
                      <TR className={n.error_log ? 'border-b-0' : undefined}>
                        <TD className="font-medium">{n.student_name}</TD>
                        <TD className="tabular-nums text-muted-foreground">{n.parent_phone}</TD>
                        <TD>{formatDateTime(n.created_at)}</TD>
                        <TD>
                          <NotificationBadge status={n.status} />
                          {n.attempts.length > 1 && <span className="ml-1.5 text-xs text-muted-foreground">×{n.attempts.length}</span>}
                        </TD>
                        <TD className="text-right">
                          {n.status === 'failed' && (
                            <Can permission="notifications.retry">
                              <Button
                                size="sm"
                                variant="outline"
                                loading={retryingId === n.id}
                                onClick={() => {
                                  setRetryingId(n.id)
                                  retry.mutate(n.id, { onSettled: () => setRetryingId(null) })
                                }}
                                aria-label={`Retry message to parent of ${n.student_name}`}
                              >
                                <RotateCw className="h-3 w-3" aria-hidden /> Retry
                              </Button>
                            </Can>
                          )}
                        </TD>
                      </TR>
                      {n.error_log && (
                        <TR className="bg-destructive/5 hover:bg-destructive/5">
                          <TD colSpan={5} className="py-1 text-xs text-destructive">
                            {n.error_log}
                          </TD>
                        </TR>
                      )}
                    </Fragment>
                  ))}
                </TBody>
              )}
            </Table>
          )}
          {ledger.data?.data.length === 0 && <EmptyState icon={MessageSquareOff} title="No messages" description="No notifications match this filter." />}
          {ledger.data && <Pagination page={ledger.data.page} pageSize={ledger.data.page_size} total={ledger.data.total} onPage={setPage} />}
        </Card>
      </div>
    </>
  )
}
