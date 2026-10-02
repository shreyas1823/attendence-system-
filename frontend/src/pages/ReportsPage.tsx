import { FileDown, FileSpreadsheet, Printer, RefreshCw, SearchX } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Can } from '@/auth/guards'
import { EmptyState, ErrorState } from '@/components/common/EmptyState'
import { PageHeader } from '@/components/common/PageHeader'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input, Label, Select } from '@/components/ui/form'
import { Skeleton, TableSkeleton } from '@/components/ui/skeleton'
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table'
import { useClasses, useReport, useSheetsSync } from '@/hooks/queries'
import { downloadCsv, toDateInput } from '@/lib/format'

type Range = 'daily' | 'weekly' | 'monthly' | 'custom'

function rangeDates(range: Exclude<Range, 'custom'>) {
  const to = new Date()
  const from = new Date()
  from.setDate(to.getDate() - { daily: 0, weekly: 6, monthly: 29 }[range])
  return { from: toDateInput(from), to: toDateInput(to) }
}

const THRESHOLDS = [
  { label: 'All students', value: 100 },
  { label: 'Below 90%', value: 90 },
  { label: 'Below 75% (defaulters)', value: 75 },
  { label: 'Below 50% (chronic)', value: 50 },
]

export default function ReportsPage() {
  const [range, setRange] = useState<Range>('monthly')
  const [dates, setDates] = useState(() => rangeDates('monthly'))
  const [department, setDepartment] = useState('')
  const [maxPct, setMaxPct] = useState(75)

  const classes = useClasses()
  const departments = [...new Set(classes.data?.map((c) => c.department) ?? [])]
  const { data, isPending, isError, refetch } = useReport({ ...dates, department, max_pct: maxPct })
  const sync = useSheetsSync()

  const pick = (r: Range) => {
    setRange(r)
    if (r !== 'custom') setDates(rangeDates(r))
  }

  const exportCsv = () => {
    if (!data) return
    downloadCsv(
      `attendance_${data.from}_${data.to}.csv`,
      ['Roll no', 'Name', 'Class', 'Department', 'Days present', 'Days total', 'Attendance %'],
      data.rows.map((r) => [r.roll_no, r.name, r.class_name, r.department, r.days_present, r.days_total, r.attendance_pct]),
    )
  }

  const worst = data?.rows.slice(0, 8).map((r) => ({ name: r.name.split(' ')[0], pct: r.attendance_pct }))

  return (
    <>
      <PageHeader
        title="Reports & analytics"
        description="Defaulter lists and attendance percentages over a date range."
        actions={
          <>
            <Button asChild variant="outline" size="sm">
              <Link to="/reports/sheet">
                <FileSpreadsheet className="h-3.5 w-3.5" aria-hidden /> Institutional sheet
              </Link>
            </Button>
            <Button variant="outline" size="sm" onClick={exportCsv} disabled={!data?.rows.length}>
              <FileDown className="h-3.5 w-3.5" aria-hidden /> CSV
            </Button>
            <Button variant="outline" size="sm" onClick={() => window.print()} disabled={!data?.rows.length} title="Opens the print dialog — choose “Save as PDF”">
              <Printer className="h-3.5 w-3.5" aria-hidden /> PDF
            </Button>
            <Can permission="reports.sync">
              <Button size="sm" onClick={() => sync.mutate()} loading={sync.isPending}>
                <RefreshCw className="h-3.5 w-3.5" aria-hidden /> Sync to Google Sheets
              </Button>
            </Can>
          </>
        }
      />

      <Card className="no-print mb-4">
        <div className="flex flex-wrap items-end gap-3 p-3">
          <div className="space-y-1">
            <Label>Period</Label>
            <div className="flex overflow-hidden rounded-md border" role="group" aria-label="Period">
              {(['daily', 'weekly', 'monthly', 'custom'] as Range[]).map((r) => (
                <button
                  key={r}
                  type="button"
                  aria-pressed={range === r}
                  onClick={() => pick(r)}
                  className={`h-8 px-3 text-xs font-medium capitalize ${range === r ? 'bg-primary text-primary-foreground' : 'bg-card hover:bg-muted'}`}
                >
                  {r}
                </button>
              ))}
            </div>
          </div>
          {range === 'custom' && (
            <>
              <div className="space-y-1">
                <Label htmlFor="from">From</Label>
                <Input id="from" type="date" className="w-36" value={dates.from} max={dates.to} onChange={(e) => e.target.value && setDates((d) => ({ ...d, from: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="to">To</Label>
                <Input id="to" type="date" className="w-36" value={dates.to} min={dates.from} onChange={(e) => e.target.value && setDates((d) => ({ ...d, to: e.target.value }))} />
              </div>
            </>
          )}
          <div className="space-y-1">
            <Label htmlFor="dept">Department</Label>
            <Select id="dept" className="w-44" value={department} onChange={(e) => setDepartment(e.target.value)}>
              <option value="">All departments</option>
              {departments.map((d) => (
                <option key={d}>{d}</option>
              ))}
            </Select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="threshold">Attendance threshold</Label>
            <Select id="threshold" className="w-48" value={maxPct} onChange={(e) => setMaxPct(Number(e.target.value))}>
              {THRESHOLDS.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </Select>
          </div>
        </div>
      </Card>

      {isError ? (
        <Card>
          <ErrorState onRetry={() => refetch()} />
        </Card>
      ) : (
        <div className="grid gap-4 xl:grid-cols-3">
          <Card className="xl:col-span-1">
            <CardHeader>
              <CardTitle>Lowest attendance</CardTitle>
              {data && <Badge variant="info">Avg {data.average_pct}%</Badge>}
            </CardHeader>
            <CardContent>
              <div className="h-64">
                {isPending ? (
                  <Skeleton className="h-full w-full" />
                ) : worst && worst.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={worst} layout="vertical" margin={{ left: 10, right: 12 }}>
                      <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="hsl(220 14% 88%)" />
                      <XAxis type="number" domain={[0, 100]} unit="%" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                      <YAxis type="category" dataKey="name" width={64} tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                      <Tooltip formatter={(v: number) => `${v}%`} cursor={{ fill: 'hsl(220 16% 94%)' }} />
                      <Bar dataKey="pct" name="Attendance" radius={[0, 3, 3, 0]}>
                        {worst.map((w) => (
                          <Cell key={w.name} fill={w.pct < 50 ? 'hsl(0 72% 50%)' : 'hsl(38 92% 40%)'} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <EmptyState title="No data" />
                )}
              </div>
            </CardContent>
          </Card>

          <Card className="xl:col-span-2">
            <CardHeader>
              <CardTitle>
                <FileSpreadsheet className="mr-1.5 inline h-4 w-4 text-muted-foreground" aria-hidden />
                Defaulter list
              </CardTitle>
              {data && <span className="text-xs text-muted-foreground">{data.rows.length} students</span>}
            </CardHeader>
            <Table>
              <THead>
                <TR className="hover:bg-transparent">
                  <TH>Roll no.</TH>
                  <TH>Name</TH>
                  <TH>Class</TH>
                  <TH>Present / Total</TH>
                  <TH className="text-right">%</TH>
                </TR>
              </THead>
              {isPending ? (
                <TableSkeleton rows={6} cols={5} />
              ) : (
                <TBody>
                  {data.rows.map((r) => (
                    <TR key={r.student_id}>
                      <TD className="tabular-nums text-muted-foreground">{r.roll_no}</TD>
                      <TD className="font-medium">{r.name}</TD>
                      <TD>{r.class_name}</TD>
                      <TD className="tabular-nums">
                        {r.days_present} / {r.days_total}
                      </TD>
                      <TD className="text-right">
                        <Badge variant={r.attendance_pct < 50 ? 'danger' : r.attendance_pct < 75 ? 'warning' : 'success'}>{r.attendance_pct}%</Badge>
                      </TD>
                    </TR>
                  ))}
                </TBody>
              )}
            </Table>
            {data?.rows.length === 0 && <EmptyState icon={SearchX} title="No students match" description="Nobody falls under this threshold for the chosen period." />}
          </Card>
        </div>
      )}
    </>
  )
}
