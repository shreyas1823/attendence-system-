import { useState } from 'react'
import { useAuth } from '@/auth/AuthContext'
import { ErrorState } from '@/components/common/EmptyState'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Skeleton } from '@/components/ui/skeleton'
import { useRemoveEnrollment, useStudent } from '@/hooks/queries'
import { formatDateTime } from '@/lib/format'
import type { FingerSlot } from '@/types'
import { EnrollmentWorkflow } from './EnrollmentWorkflow'
import { StudentBiometricStatus } from './StudentBiometricStatus'

export function StudentProfileDialog({ studentId, onClose }: { studentId: string | null; onClose: () => void }) {
  const { can } = useAuth()
  const { data, isPending, isError, refetch } = useStudent(studentId)
  const remove = useRemoveEnrollment(studentId ?? '')
  const [enrolling, setEnrolling] = useState<FingerSlot | null>(null)
  const [removing, setRemoving] = useState<FingerSlot | null>(null)

  const close = () => {
    setEnrolling(null)
    onClose()
  }

  return (
    <Dialog open={!!studentId} onOpenChange={(o) => !o && close()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{data?.name ?? 'Student profile'}</DialogTitle>
          <DialogDescription>Details and fingerprint enrollment</DialogDescription>
        </DialogHeader>

        {isPending ? (
          <div className="space-y-3">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-24 w-full" />
          </div>
        ) : isError ? (
          <ErrorState onRetry={() => refetch()} />
        ) : (
          <div className="space-y-4">
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
              <Detail label="Roll number" value={data.student_id} />
              <Detail label="Class" value={`${data.class_name} · ${data.department}`} />
              <Detail label="Parent phone" value={data.parent_phone} />
              <Detail label="Registered" value={formatDateTime(data.created_at)} />
              <Detail label="Status" value={<Badge variant={data.status === 'active' ? 'success' : 'default'}>{data.status}</Badge>} />
            </dl>

            <StudentBiometricStatus
              enrollments={data.enrollments}
              canEnroll={can('biometric.enroll') && !enrolling}
              canRemove={can('biometric.remove')}
              busySlot={removing}
              onEnroll={setEnrolling}
              onRemove={(slot) => {
                setRemoving(slot)
                remove.mutate(slot, { onSettled: () => setRemoving(null) })
              }}
            />

            {enrolling && <EnrollmentWorkflow studentId={data.id} slot={enrolling} onDone={() => setEnrolling(null)} />}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

function Detail({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="font-medium">{value}</dd>
    </div>
  )
}
