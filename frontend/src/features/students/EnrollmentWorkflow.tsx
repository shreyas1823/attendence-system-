import { CheckCircle2, Loader2, XCircle } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Label, Select } from '@/components/ui/form'
import { useDevices, useEnrollmentSession, useStartEnrollment } from '@/hooks/queries'
import type { EnrollmentSession, FingerSlot } from '@/types'

interface Props {
  studentId: string
  slot: FingerSlot
  onDone: () => void
}

/**
 * Enrollment flow: pick an online device -> device enters enrollment mode -> we poll for the
 * capture confirmation -> the new template is linked to the student profile.
 */
export function EnrollmentWorkflow({ studentId, slot, onDone }: Props) {
  const devices = useDevices()
  const start = useStartEnrollment(studentId)
  const [deviceId, setDeviceId] = useState('')
  const [session, setSession] = useState<EnrollmentSession | null>(null)
  const live = useEnrollmentSession(session)

  const usable = devices.data?.filter((d) => d.status === 'online' && !d.revoked) ?? []
  const phase = live.data?.phase

  if (session && live.data) {
    const done = phase === 'captured'
    const failed = phase === 'failed' || phase === 'timeout'
    return (
      <div className="rounded-md border bg-muted/40 p-3" role="status" aria-live="polite">
        <div className="flex items-start gap-2">
          {done ? (
            <CheckCircle2 className="mt-0.5 h-4 w-4 text-success" aria-hidden />
          ) : failed ? (
            <XCircle className="mt-0.5 h-4 w-4 text-destructive" aria-hidden />
          ) : (
            <Loader2 className="mt-0.5 h-4 w-4 animate-spin text-primary" aria-hidden />
          )}
          <div className="space-y-0.5">
            <p className="text-sm font-medium">
              {done ? `Fingerprint ${slot} enrolled` : failed ? 'Enrollment did not complete' : `Enrolling fingerprint ${slot}…`}
            </p>
            <p className="text-xs text-muted-foreground">{live.data.message}</p>
          </div>
        </div>
        <div className="mt-3 flex justify-end">
          <Button size="sm" variant={done ? 'default' : 'outline'} onClick={onDone}>
            {done ? 'Done' : 'Close'}
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-3 rounded-md border bg-muted/40 p-3">
      <p className="text-sm font-medium">Enroll fingerprint {slot}</p>
      <div className="space-y-1">
        <Label htmlFor="enroll-device">Biometric device</Label>
        <Select id="enroll-device" value={deviceId} onChange={(e) => setDeviceId(e.target.value)} disabled={devices.isPending}>
          <option value="">{devices.isPending ? 'Loading devices…' : 'Select an online device'}</option>
          {usable.map((d) => (
            <option key={d.id} value={d.id}>
              {d.location} — {d.device_id}
            </option>
          ))}
        </Select>
        {devices.isSuccess && usable.length === 0 && <p className="text-xs text-destructive">No online devices available.</p>}
      </div>
      <div className="flex justify-end gap-2">
        <Button size="sm" variant="outline" onClick={onDone}>
          Cancel
        </Button>
        <Button
          size="sm"
          disabled={!deviceId}
          loading={start.isPending}
          onClick={() => start.mutate({ finger_slot: slot, device_id: deviceId }, { onSuccess: setSession })}
        >
          Start enrollment
        </Button>
      </div>
    </div>
  )
}
