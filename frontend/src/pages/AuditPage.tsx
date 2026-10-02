import { ScrollText } from 'lucide-react'
import { useState } from 'react'
import { EmptyState, ErrorState } from '@/components/common/EmptyState'
import { PageHeader } from '@/components/common/PageHeader'
import { Pagination } from '@/components/common/Pagination'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { Select } from '@/components/ui/form'
import { TableSkeleton } from '@/components/ui/skeleton'
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table'
import { useAudit } from '@/hooks/queries'
import { formatDateTime } from '@/lib/format'

const GROUPS = [
  { label: 'All actions', value: '' },
  { label: 'Attendance', value: 'attendance' },
  { label: 'Fingerprints', value: 'fingerprint' },
  { label: 'Devices', value: 'device' },
  { label: 'Settings', value: 'settings' },
  { label: 'Students', value: 'student' },
]

export default function AuditPage() {
  const [page, setPage] = useState(1)
  const [action, setAction] = useState('')
  const { data, isPending, isError, refetch } = useAudit({ page, action })

  return (
    <>
      <PageHeader title="Audit logs" description="Immutable, read-only record of administrative actions." />
      <Card>
        <div className="border-b p-3">
          <Select
            className="w-44"
            aria-label="Filter by action"
            value={action}
            onChange={(e) => {
              setAction(e.target.value)
              setPage(1)
            }}
          >
            {GROUPS.map((g) => (
              <option key={g.value} value={g.value}>
                {g.label}
              </option>
            ))}
          </Select>
        </div>
        {isError ? (
          <ErrorState onRetry={() => refetch()} />
        ) : (
          <Table>
            <THead>
              <TR className="hover:bg-transparent">
                <TH>When</TH>
                <TH>User</TH>
                <TH>Action</TH>
                <TH>Entity</TH>
                <TH>Detail</TH>
              </TR>
            </THead>
            {isPending ? (
              <TableSkeleton rows={10} cols={5} />
            ) : (
              <TBody>
                {data.data.map((e) => (
                  <TR key={e.id}>
                    <TD className="whitespace-nowrap tabular-nums text-muted-foreground">{formatDateTime(e.created_at)}</TD>
                    <TD className="font-medium">{e.actor_name}</TD>
                    <TD>
                      <Badge variant="outline" className="font-mono">
                        {e.action}
                      </Badge>
                    </TD>
                    <TD className="text-muted-foreground">{e.entity}</TD>
                    <TD className="max-w-md truncate" title={e.detail}>
                      {e.detail}
                    </TD>
                  </TR>
                ))}
              </TBody>
            )}
          </Table>
        )}
        {data?.data.length === 0 && <EmptyState icon={ScrollText} title="No events" description="Nothing has been logged for this filter yet." />}
        {data && <Pagination page={data.page} pageSize={data.page_size} total={data.total} onPage={setPage} />}
      </Card>
    </>
  )
}
