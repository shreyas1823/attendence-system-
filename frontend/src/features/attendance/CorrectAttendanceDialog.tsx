import { zodResolver } from '@hookform/resolvers/zod'
import { History } from 'lucide-react'
import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { AttendanceBadge } from '@/components/common/StatusBadge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Field, Select, Textarea } from '@/components/ui/form'
import { useCorrectAttendance } from '@/hooks/queries'
import { formatDateTime, formatTime } from '@/lib/format'
import type { AttendanceRow } from '@/types'

export const MIN_REASON = 10
export const MAX_REASON = 500

export const correctionSchema = z.object({
  new_status: z.enum(['present', 'absent']),
  reason: z
    .string()
    .trim()
    .min(1, 'A reason is required')
    .min(MIN_REASON, `Please give at least ${MIN_REASON} characters`)
    .max(MAX_REASON, `Keep it under ${MAX_REASON} characters`),
})
export type CorrectionValues = z.infer<typeof correctionSchema>

interface Props {
  row: AttendanceRow | null
  onClose: () => void
}

export function CorrectAttendanceDialog({ row, onClose }: Props) {
  const correct = useCorrectAttendance()

  const {
    register,
    handleSubmit,
    reset,
    setError,
    watch,
    formState: { errors },
  } = useForm<CorrectionValues>({
    resolver: zodResolver(correctionSchema),
    defaultValues: { new_status: 'present', reason: '' },
  })

  // Default to the opposite of the current status each time a new row is opened.
  useEffect(() => {
    if (row) reset({ new_status: row.status === 'present' ? 'absent' : 'present', reason: '' })
  }, [row, reset])

  const reasonLength = watch('reason')?.length ?? 0

  const onSubmit = (values: CorrectionValues) => {
    if (!row) return
    if (values.new_status === row.status) {
      setError('new_status', { message: `Record is already ${row.status}` })
      return
    }
    // Optimistic: the table updates instantly (see useCorrectAttendance); close without waiting.
    correct.mutate({ attendance_id: row.id, ...values })
    onClose()
  }

  return (
    <Dialog open={!!row} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        {row && (
          <form onSubmit={handleSubmit(onSubmit)} noValidate>
            <DialogHeader>
              <DialogTitle>Correct attendance</DialogTitle>
              <DialogDescription>
                {row.student_name} · {row.roll_no} · {row.attendance_date}
              </DialogDescription>
            </DialogHeader>

            <div className="mb-3 flex items-center gap-3 rounded-md bg-muted/60 px-3 py-2 text-xs">
              <span className="text-muted-foreground">Current</span>
              <AttendanceBadge status={row.status} />
              <span className="ml-auto tabular-nums text-muted-foreground">
                {formatTime(row.scan_time_1)} · {formatTime(row.scan_time_2)}
              </span>
            </div>

            <div className="space-y-3">
              <Field label="New status" htmlFor="new_status" error={errors.new_status?.message}>
                <Select id="new_status" aria-invalid={!!errors.new_status} {...register('new_status')}>
                  <option value="present">Present</option>
                  <option value="absent">Absent</option>
                </Select>
              </Field>

              <Field label="Reason for adjustment" htmlFor="reason" error={errors.reason?.message}>
                <Textarea
                  id="reason"
                  placeholder="e.g. Sensor failed after 3 retries; teacher confirmed attendance in person"
                  aria-invalid={!!errors.reason}
                  {...register('reason')}
                />
                <p className="text-right text-[11px] text-muted-foreground">
                  {reasonLength}/{MAX_REASON}
                </p>
              </Field>
            </div>

            <p className="mt-2 text-[11px] text-muted-foreground">
              Corrections are never edited in place. This creates a permanent correction record and an audit event.
            </p>

            {row.corrections.length > 0 && (
              <div className="mt-4 border-t pt-3">
                <h4 className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
                  <History className="h-3.5 w-3.5" aria-hidden /> Previous adjustments
                </h4>
                <ul className="space-y-2">
                  {row.corrections.map((c) => (
                    <li key={c.id} className="rounded-md border p-2 text-xs">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <AttendanceBadge status={c.original_status} />
                        <span aria-hidden>→</span>
                        <AttendanceBadge status={c.new_status} />
                        <span className="ml-auto text-muted-foreground">
                          {c.corrected_by_name} · {formatDateTime(c.timestamp)}
                        </span>
                      </div>
                      <p className="mt-1 text-muted-foreground">{c.reason}</p>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <DialogFooter>
              <Button type="button" variant="outline" onClick={onClose}>
                Cancel
              </Button>
              <Button type="submit">Save correction</Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}
