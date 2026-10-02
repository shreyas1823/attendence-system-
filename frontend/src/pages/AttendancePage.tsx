import { ClipboardList, Pencil } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useAuth } from '@/auth/AuthContext'
import { EmptyState, ErrorState } from '@/components/common/EmptyState'
import { PageHeader } from '@/components/common/PageHeader'
import { AttendanceBadge } from '@/components/common/StatusBadge'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input, Select } from '@/components/ui/form'
import { TableSkeleton } from '@/components/ui/skeleton'
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table'
import { CorrectAttendanceDialog } from '@/features/attendance/CorrectAttendanceDialog'
import { useAttendance, useClasses } from '@/hooks/queries'
import { formatTime, toDateInput } from '@/lib/format'
import type { AttendanceRow, AttendanceStatus } from '@/types'

export default function AttendancePage() {
  const { can } = useAuth()
  const [date, setDate] = useState(() => toDateInput(new Date()))
  const [classId, setClassId] = useState('')
  const [status, setStatus] = useState<AttendanceStatus | ''>('')
  const [editing, setEditing] = useState<AttendanceRow | null>(null)

  const classes = useClasses()
  const { data, isPending, isError, refetch } = useAttendance({ date, class_id: classId, status })

  const totals = useMemo(() => {
    const present = data?.filter((r) => r.status === 'present').length ?? 0
    return { present, absent: (data?.length ?? 0) - present }
  }, [data])

  return (
    <>
      <PageHeader title="Daily attendance" description="Two scans per day: check-in, then check-out. A third scan is rejected." />

      <Card>
        <div className="flex flex-wrap items-center gap-2 border-b p-3">
          <Input type="date" className="w-40" aria-label="Date" value={date} max={toDateInput(new Date())} onChange={(e) => e.target.value && setDate(e.target.value)} />
          <Select className="w-40" aria-label="Filter by class" value={classId} onChange={(e) => setClassId(e.target.value)}>
            <option value="">All classes</option>
            {classes.data?.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
          <Select className="w-36" aria-label="Filter by status" value={status} onChange={(e) => setStatus(e.target.value as AttendanceStatus | '')}>
            <option value="">Any status</option>
            <option value="present">Present</option>
            <option value="absent">Absent</option>
          </Select>
          {data && (
            <span className="ml-auto flex gap-1.5">
              <Badge variant="success">{totals.present} present</Badge>
              <Badge variant="danger">{totals.absent} absent</Badge>
            </span>
          )}
        </div>

        {isError ? (
          <ErrorState onRetry={() => refetch()} />
        ) : (
          <>
            <Table>
              <THead>
                <TR className="hover:bg-transparent">
                  <TH>Roll no.</TH>
                  <TH>Student</TH>
                  <TH>Class</TH>
                  <TH>Check-in / Check-out</TH>
                  <TH>Status</TH>
                  <TH className="text-right">Actions</TH>
                </TR>
              </THead>
              {isPending ? (
                <TableSkeleton rows={10} cols={6} />
              ) : (
                <TBody>
                  {data.map((r) => (
                    <TR key={r.id}>
                      <TD className="tabular-nums text-muted-foreground">{r.roll_no}</TD>
                      <TD className="font-medium">{r.student_name}</TD>
                      <TD>{r.class_name}</TD>
                      <TD className="tabular-nums">
                        {r.scan_time_1 ? `${formatTime(r.scan_time_1)}, ${formatTime(r.scan_time_2)}` : '—'}
                      </TD>
                      <TD>
                        <span className="inline-flex items-center gap-1.5">
                          <AttendanceBadge status={r.status} />
                          {r.corrections.length > 0 && (
                            <Badge variant="warning" title="This record has been manually corrected">
                              Corrected
                            </Badge>
                          )}
                        </span>
                      </TD>
                      <TD className="text-right">
                        {can('attendance.correct') ? (
                          <Button variant="outline" size="sm" onClick={() => setEditing(r)} aria-label={`Correct attendance for ${r.student_name}`}>
                            <Pencil className="h-3 w-3" aria-hidden /> Correct
                          </Button>
                        ) : null}
                      </TD>
                    </TR>
                  ))}
                </TBody>
              )}
            </Table>
            {data?.length === 0 && <EmptyState icon={ClipboardList} title="No records" description="Nothing matches these filters for the selected date." />}
          </>
        )}
      </Card>

      <CorrectAttendanceDialog row={editing} onClose={() => setEditing(null)} />
    </>
  )
}
