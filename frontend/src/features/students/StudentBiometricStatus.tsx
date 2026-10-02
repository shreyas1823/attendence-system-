import { Fingerprint, Plus, Trash2 } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { formatDateTime } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { FingerprintEnrollment, FingerSlot } from '@/types'

interface Props {
  enrollments: Pick<FingerprintEnrollment, 'finger_slot' | 'enrolled_at'>[]
  canEnroll?: boolean
  canRemove?: boolean
  busySlot?: FingerSlot | null
  onEnroll?: (slot: FingerSlot) => void
  onRemove?: (slot: FingerSlot) => void
}

const SLOTS: FingerSlot[] = [1, 2]

/** Shows Fingerprint 1 / Fingerprint 2 state for a single student identity. */
export function StudentBiometricStatus({ enrollments, canEnroll, canRemove, busySlot, onEnroll, onRemove }: Props) {
  const enrolledCount = enrollments.length
  return (
    <section aria-label="Biometric status">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Biometrics</h3>
        <span className="text-xs text-muted-foreground">{enrolledCount} of 2 enrolled</span>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {SLOTS.map((slot) => {
          const rec = enrollments.find((e) => e.finger_slot === slot)
          return (
            <div
              key={slot}
              data-testid={`slot-${slot}`}
              className={cn('flex flex-col gap-2 rounded-md border p-3', rec ? 'border-success/30 bg-success/5' : 'border-dashed')}
            >
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1.5 text-xs font-medium">
                  <Fingerprint className={cn('h-4 w-4', rec ? 'text-success' : 'text-muted-foreground')} aria-hidden />
                  Fingerprint {slot}
                </span>
                <Badge variant={rec ? 'success' : 'outline'}>{rec ? 'Enrolled' : 'Empty'}</Badge>
              </div>
              <p className="min-h-4 text-xs text-muted-foreground">{rec ? `Enrolled ${formatDateTime(rec.enrolled_at)}` : 'Not enrolled yet'}</p>
              {rec
                ? canRemove && (
                    <Button variant="outline" size="sm" onClick={() => onRemove?.(slot)} loading={busySlot === slot} aria-label={`Remove fingerprint ${slot}`}>
                      <Trash2 className="h-3 w-3" aria-hidden /> Remove
                    </Button>
                  )
                : canEnroll && (
                    <Button size="sm" onClick={() => onEnroll?.(slot)} aria-label={`Enroll fingerprint ${slot}`}>
                      <Plus className="h-3 w-3" aria-hidden /> Enroll
                    </Button>
                  )}
            </div>
          )
        })}
      </div>
    </section>
  )
}

/** Compact variant for table rows. */
export function SlotDots({ slots }: { slots: FingerSlot[] }) {
  return (
    <span className="inline-flex items-center gap-1" aria-label={`${slots.length} of 2 fingerprints enrolled`}>
      {SLOTS.map((s) => (
        <span
          key={s}
          title={`Fingerprint ${s}: ${slots.includes(s) ? 'enrolled' : 'empty'}`}
          className={cn('inline-flex h-5 w-5 items-center justify-center rounded text-[10px] font-semibold', slots.includes(s) ? 'bg-success/15 text-success' : 'bg-muted text-muted-foreground')}
        >
          {s}
        </span>
      ))}
    </span>
  )
}
