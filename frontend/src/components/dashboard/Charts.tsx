import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { EmptyState, ErrorState } from '@/components/common/EmptyState'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { useAbsentByDepartment, useWeeklyTrend } from '@/hooks/queries'

const COLORS = { present: 'hsl(152 60% 32%)', absent: 'hsl(0 72% 50%)', dept: 'hsl(232 70% 52%)' }
const AXIS = { fontSize: 11, fill: 'hsl(222 10% 42%)' }

function ChartShell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="h-60">{children}</div>
      </CardContent>
    </Card>
  )
}

export function WeeklyChart() {
  const { data, isPending, isError, refetch } = useWeeklyTrend()
  return (
    <ChartShell title="Weekly attendance">
      {isPending ? (
        <Skeleton className="h-full w-full" />
      ) : isError ? (
        <ErrorState onRetry={() => refetch()} />
      ) : (
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ left: -20, right: 4, top: 4 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(220 14% 88%)" />
            <XAxis dataKey="day" tick={AXIS} axisLine={false} tickLine={false} />
            <YAxis tick={AXIS} axisLine={false} tickLine={false} />
            <Tooltip cursor={{ fill: 'hsl(220 16% 94%)' }} />
            <Legend iconType="circle" wrapperStyle={{ fontSize: 11 }} />
            <Bar dataKey="present" name="Present" fill={COLORS.present} radius={[3, 3, 0, 0]} />
            <Bar dataKey="absent" name="Absent" fill={COLORS.absent} radius={[3, 3, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      )}
    </ChartShell>
  )
}

export function AbsentByDepartmentChart() {
  const { data, isPending, isError, refetch } = useAbsentByDepartment()
  return (
    <ChartShell title="Absent today by department">
      {isPending ? (
        <Skeleton className="h-full w-full" />
      ) : isError ? (
        <ErrorState onRetry={() => refetch()} />
      ) : data.length === 0 ? (
        <EmptyState title="No absences today" description="Everyone is accounted for." />
      ) : (
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} layout="vertical" margin={{ left: 20, right: 12, top: 4 }}>
            <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="hsl(220 14% 88%)" />
            <XAxis type="number" allowDecimals={false} tick={AXIS} axisLine={false} tickLine={false} />
            <YAxis type="category" dataKey="department" width={110} tick={AXIS} axisLine={false} tickLine={false} />
            <Tooltip cursor={{ fill: 'hsl(220 16% 94%)' }} />
            <Bar dataKey="absent" name="Absent" fill={COLORS.dept} radius={[0, 3, 3, 0]} />
          </BarChart>
        </ResponsiveContainer>
      )}
    </ChartShell>
  )
}
