import { Badge } from '@/components/ui/badge'
import type { AttendanceStatus, DeviceStatus, NotificationStatus } from '@/types'

export function AttendanceBadge({ status }: { status: AttendanceStatus }) {
  return <Badge variant={status === 'present' ? 'success' : 'danger'}>{status === 'present' ? 'Present' : 'Absent'}</Badge>
}

const NOTIF: Record<NotificationStatus, { label: string; variant: 'default' | 'info' | 'success' | 'danger' }> = {
  queued: { label: 'Queued', variant: 'default' },
  sent: { label: 'Sent', variant: 'info' },
  delivered: { label: 'Delivered', variant: 'success' },
  failed: { label: 'Failed', variant: 'danger' },
}

export function NotificationBadge({ status }: { status: NotificationStatus }) {
  const { label, variant } = NOTIF[status]
  return <Badge variant={variant}>{label}</Badge>
}

export function DeviceBadge({ status, revoked }: { status: DeviceStatus; revoked?: boolean }) {
  if (revoked) return <Badge variant="danger">Revoked</Badge>
  return <Badge variant={status === 'online' ? 'success' : 'warning'}>{status === 'online' ? 'Online' : 'Offline'}</Badge>
}
