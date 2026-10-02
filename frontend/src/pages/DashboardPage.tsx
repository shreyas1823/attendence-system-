import { Cpu, MessageCircle, Percent, UserCheck, UserX } from 'lucide-react'
import { Link } from 'react-router-dom'
import { PageHeader } from '@/components/common/PageHeader'
import { AbsentByDepartmentChart, WeeklyChart } from '@/components/dashboard/Charts'
import { KpiCard } from '@/components/dashboard/KpiCard'
import { LiveFeed } from '@/components/dashboard/LiveFeed'
import { ErrorState } from '@/components/common/EmptyState'
import { Card } from '@/components/ui/card'
import { useDashboardSummary } from '@/hooks/queries'

export default function DashboardPage() {
  const { data, isPending, isError, refetch } = useDashboardSummary()

  return (
    <>
      <PageHeader title="Overview" description="Today's attendance at a glance. Data refreshes automatically." />

      {isError ? (
        <Card className="mb-4">
          <ErrorState onRetry={() => refetch()} />
        </Card>
      ) : (
        <section aria-label="Key metrics" className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
          <KpiCard
            label="Today's attendance"
            icon={Percent}
            loading={isPending}
            value={data && `${data.attendance_pct}%`}
            hint={data && `${data.present} of ${data.total_students} students`}
            tone={data && data.attendance_pct < 75 ? 'warning' : 'success'}
          />
          <KpiCard label="Present" icon={UserCheck} tone="success" loading={isPending} value={data?.present} hint="Marked present today" />
          <KpiCard label="Absent" icon={UserX} tone="danger" loading={isPending} value={data?.absent} hint="Parents notified at end of day" />
          <KpiCard
            label="Biometric devices online"
            icon={Cpu}
            loading={isPending}
            tone={data && data.devices_online < data.devices_total ? 'warning' : 'success'}
            value={data && `${data.devices_online}/${data.devices_total}`}
            hint={data && data.devices_online < data.devices_total ? 'Some devices offline' : 'All devices reporting'}
          />
          <KpiCard
            label="Pending WhatsApp jobs"
            icon={MessageCircle}
            loading={isPending}
            tone={data && data.pending_whatsapp_jobs > 0 ? 'warning' : 'default'}
            value={data?.pending_whatsapp_jobs}
            hint={data && `${data.pending_sheets_jobs} Sheets sync pending`}
          />
        </section>
      )}

      <div className="grid gap-4 xl:grid-cols-5">
        <div className="xl:col-span-3">
          <LiveFeed />
        </div>
        <div className="space-y-4 xl:col-span-2">
          <WeeklyChart />
          <AbsentByDepartmentChart />
        </div>
      </div>

      <p className="mt-4 text-xs text-muted-foreground">
        Need to fix a record? Open <Link to="/attendance" className="font-medium text-primary hover:underline">Attendance</Link> to apply an audited correction.
      </p>
    </>
  )
}
