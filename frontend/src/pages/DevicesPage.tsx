import { Copy, Cpu, KeyRound, Power, ShieldOff } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { Can } from '@/auth/guards'
import { EmptyState, ErrorState } from '@/components/common/EmptyState'
import { PageHeader } from '@/components/common/PageHeader'
import { DeviceBadge } from '@/components/common/StatusBadge'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { TableSkeleton } from '@/components/ui/skeleton'
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table'
import { useDeviceActions, useDevices } from '@/hooks/queries'
import { formatDateTime, timeAgo } from '@/lib/format'
import type { Device } from '@/types'

type Pending = { kind: 'regenerate' | 'revoke'; device: Device } | null

export default function DevicesPage() {
  const { data, isPending, isError, refetch } = useDevices()
  const { regenerate, toggleEnrollment, revoke } = useDeviceActions()
  const [confirm, setConfirm] = useState<Pending>(null)
  const [secret, setSecret] = useState<{ device_id: string; secret: string } | null>(null)

  const run = () => {
    if (!confirm) return
    const { kind, device } = confirm
    if (kind === 'revoke') {
      revoke.mutate(device.id, { onSettled: () => setConfirm(null) })
    } else {
      regenerate.mutate(device.id, {
        onSuccess: (res) => setSecret(res),
        onSettled: () => setConfirm(null),
      })
    }
  }

  return (
    <>
      <PageHeader title="Devices" description="ESP8266 biometric nodes and their heartbeat." />

      <Card>
        {isError ? (
          <ErrorState onRetry={() => refetch()} />
        ) : (
          <Table>
            <THead>
              <TR className="hover:bg-transparent">
                <TH>Node</TH>
                <TH>Device ID</TH>
                <TH>Location</TH>
                <TH>Last heartbeat</TH>
                <TH>Status</TH>
                <TH className="text-right">Actions</TH>
              </TR>
            </THead>
            {isPending ? (
              <TableSkeleton rows={4} cols={6} />
            ) : (
              <TBody>
                {data.map((d) => (
                  <TR key={d.id}>
                    <TD className="font-medium">{d.name}</TD>
                    <TD className="font-mono text-xs text-muted-foreground">{d.device_id}</TD>
                    <TD>{d.location}</TD>
                    <TD title={formatDateTime(d.last_heartbeat)}>{timeAgo(d.last_heartbeat)}</TD>
                    <TD>
                      <span className="inline-flex items-center gap-1.5">
                        <DeviceBadge status={d.status} revoked={d.revoked} />
                        {d.enrollment_mode && <Badge variant="info">Enrolling</Badge>}
                      </span>
                    </TD>
                    <TD className="text-right">
                      <span className="inline-flex gap-1.5">
                        <Can permission="devices.enrollment_mode">
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={d.revoked || d.status !== 'online'}
                            onClick={() => toggleEnrollment.mutate({ id: d.id, enabled: !d.enrollment_mode })}
                            aria-label={`${d.enrollment_mode ? 'Disable' : 'Enable'} enrollment mode on ${d.location}`}
                          >
                            <Power className="h-3 w-3" aria-hidden /> {d.enrollment_mode ? 'Stop enrollment' : 'Enrollment mode'}
                          </Button>
                        </Can>
                        <Can permission="devices.manage">
                          <Button size="sm" variant="outline" disabled={d.revoked} onClick={() => setConfirm({ kind: 'regenerate', device: d })} aria-label={`Regenerate credentials for ${d.device_id}`}>
                            <KeyRound className="h-3 w-3" aria-hidden /> Credentials
                          </Button>
                          <Button size="sm" variant="destructive" disabled={d.revoked} onClick={() => setConfirm({ kind: 'revoke', device: d })} aria-label={`Revoke ${d.device_id}`}>
                            <ShieldOff className="h-3 w-3" aria-hidden /> Revoke
                          </Button>
                        </Can>
                      </span>
                    </TD>
                  </TR>
                ))}
              </TBody>
            )}
          </Table>
        )}
        {data?.length === 0 && <EmptyState icon={Cpu} title="No devices registered" description="Provision a device from the backend CLI to see it here." />}
      </Card>

      <Dialog open={!!confirm} onOpenChange={(o) => !o && setConfirm(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{confirm?.kind === 'revoke' ? 'Revoke device access?' : 'Regenerate credentials?'}</DialogTitle>
            <DialogDescription>
              {confirm?.kind === 'revoke'
                ? `${confirm.device.device_id} will immediately stop being able to submit scans. This cannot be undone from the dashboard.`
                : `The current secret for ${confirm?.device.device_id} stops working immediately. You must flash the new secret onto the device.`}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirm(null)}>
              Cancel
            </Button>
            <Button variant={confirm?.kind === 'revoke' ? 'destructive' : 'default'} onClick={run} loading={revoke.isPending || regenerate.isPending}>
              {confirm?.kind === 'revoke' ? 'Revoke device' : 'Regenerate'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!secret} onOpenChange={(o) => !o && setSecret(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>New device secret</DialogTitle>
            <DialogDescription>Copy it now — it is shown once and cannot be retrieved later.</DialogDescription>
          </DialogHeader>
          <div className="flex items-center gap-2 rounded-md border bg-muted px-3 py-2">
            <code className="min-w-0 flex-1 break-all text-xs">{secret?.secret}</code>
            <Button
              size="icon"
              variant="ghost"
              aria-label="Copy secret"
              onClick={() => secret && navigator.clipboard?.writeText(secret.secret).then(() => toast.success('Copied'))}
            >
              <Copy className="h-3.5 w-3.5" />
            </Button>
          </div>
          <DialogFooter>
            <Button onClick={() => setSecret(null)}>I've saved it</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
