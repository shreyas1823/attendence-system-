import { AlertTriangle, ArrowLeft, FileSpreadsheet, FileText, Send } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'
import { Can } from '@/auth/guards'
import { EmptyState, ErrorState } from '@/components/common/EmptyState'
import { PageHeader } from '@/components/common/PageHeader'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input, Label, Select } from '@/components/ui/form'
import { Skeleton } from '@/components/ui/skeleton'
import { AttendanceSheetTable } from '@/features/reports/AttendanceSheetTable'
import { exportReportPdf } from '@/features/reports/exportPdf'
import { exportReportXlsx } from '@/features/reports/exportXlsx'
import { useAttendanceSheet, useQueueDefaulterWarnings } from '@/hooks/queries'
import { errorMessage } from '@/api/client'
import { buildSheetLayout } from '@/report-engine/layout'

const SEM_START = '2026-06-29'
const SEM_END = '2026-09-30'

export default function AttendanceSheetPage() {
  const [batch, setBatch] = useState('T1')
  const [from, setFrom] = useState(SEM_START)
  const [to, setTo] = useState(SEM_END)
  const [busy, setBusy] = useState<'xlsx' | 'pdf' | null>(null)

  const { data, isPending, isError, refetch, isPlaceholderData } = useAttendanceSheet({ batch, from, to })
  const warn = useQueueDefaulterWarnings()
  const layout = useMemo(() => (data ? buildSheetLayout(data) : null), [data])

  const defaulters = data?.rows.filter((r) => r.isDefaulter) ?? []
  const flagged = data?.rows.filter((r) => r.earlyDepartures.length > 0) ?? []
  const fileBase = `attendance_${batch}_${from}_${to}`

  const run = async (kind: 'xlsx' | 'pdf') => {
    if (!layout) return
    setBusy(kind)
    try {
      await (kind === 'xlsx' ? exportReportXlsx(layout, `${fileBase}.xlsx`) : exportReportPdf(layout, `${fileBase}.pdf`))
    } catch (e) {
      toast.error(errorMessage(e, 'Export failed'))
    } finally {
      setBusy(null)
    }
  }

  return (
    <>
      <PageHeader
        title="Attendance summary sheet"
        description="Subject-wise Theory and Practical hours, calculated from biometric checkpoints and the weekly timetable."
        actions={
          <>
            <Button asChild variant="ghost" size="sm">
              <Link to="/reports">
                <ArrowLeft className="h-3.5 w-3.5" aria-hidden /> Reports
              </Link>
            </Button>
            <Button variant="outline" size="sm" disabled={!layout} loading={busy === 'xlsx'} onClick={() => run('xlsx')}>
              <FileSpreadsheet className="h-3.5 w-3.5" aria-hidden /> Export to Excel
            </Button>
            <Button variant="outline" size="sm" disabled={!layout} loading={busy === 'pdf'} onClick={() => run('pdf')}>
              <FileText className="h-3.5 w-3.5" aria-hidden /> Export to PDF
            </Button>
          </>
        }
      />

      <Card className="mb-4">
        <div className="flex flex-wrap items-end gap-3 p-3">
          <div className="space-y-1">
            <Label htmlFor="batch">Batch</Label>
            <Select id="batch" className="w-28" value={batch} onChange={(e) => setBatch(e.target.value)}>
              <option value="T1">T1</option>
            </Select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="sheet-from">From</Label>
            <Input id="sheet-from" type="date" className="w-36" value={from} max={to} onChange={(e) => e.target.value && setFrom(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="sheet-to">To</Label>
            <Input id="sheet-to" type="date" className="w-36" value={to} min={from} onChange={(e) => e.target.value && setTo(e.target.value)} />
          </div>
          <Button variant="outline" size="sm" onClick={() => (setFrom(SEM_START), setTo(SEM_END))}>
            Full semester
          </Button>

          {data && (
            <div className="ml-auto flex flex-wrap items-center gap-2">
              <Badge variant="info">{data.engaged.workingDays} working days</Badge>
              <Badge variant={defaulters.length ? 'danger' : 'success'}>{defaulters.length} below {data.threshold}%</Badge>
              <Can permission="reports.warn">
                <Button
                  size="sm"
                  disabled={defaulters.length === 0}
                  loading={warn.isPending}
                  onClick={() => warn.mutate({ batch, from, to })}
                  title="Queues one WhatsApp warning per defaulter's guardian; safe to repeat within a month"
                >
                  <Send className="h-3.5 w-3.5" aria-hidden /> Queue guardian warnings
                </Button>
              </Can>
            </div>
          )}
        </div>
      </Card>

      {isError ? (
        <Card>
          <ErrorState onRetry={() => refetch()} />
        </Card>
      ) : isPending ? (
        <Skeleton className="h-96 w-full" />
      ) : layout && data.engaged.theoryTotal + data.engaged.practicalTotal === 0 ? (
        <Card>
          <EmptyState title="No lectures in this range" description="The selected dates fall on weekends or holidays." />
        </Card>
      ) : (
        layout && (
          <div className={isPlaceholderData ? 'opacity-60 transition-opacity' : undefined}>
            <AttendanceSheetTable layout={layout} />
            <p className="mt-2 text-xs text-muted-foreground">
              Rows shaded orange have Theory or Practical attendance below {data.threshold}%. Remedial/tutorial hours are not counted.
            </p>
          </div>
        )
      )}

      {flagged.length > 0 && (
        <Card className="mt-4">
          <details>
            <summary className="flex cursor-pointer items-center gap-2 px-4 py-3 text-sm font-semibold">
              <AlertTriangle className="h-4 w-4 text-warning" aria-hidden />
              Early departures needing review
              <Badge variant="warning">{flagged.length} students</Badge>
            </summary>
            <ul className="divide-y border-t text-xs">
              {flagged.map((r) => (
                <li key={r.studentId} className="flex flex-wrap gap-x-3 px-4 py-2">
                  <span className="w-8 tabular-nums text-muted-foreground">{r.rollNo}</span>
                  <span className="min-w-40 font-medium">{r.name}</span>
                  <span className="text-muted-foreground">
                    {r.earlyDepartures.length} day(s): {r.earlyDepartures.slice(0, 6).join(', ')}
                    {r.earlyDepartures.length > 6 && ` +${r.earlyDepartures.length - 6} more`}
                  </span>
                </li>
              ))}
            </ul>
          </details>
        </Card>
      )}
    </>
  )
}
