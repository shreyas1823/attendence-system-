import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { errorMessage } from '@/api/client'
import {
  attendanceApi,
  auditApi,
  classesApi,
  dashboardApi,
  devicesApi,
  notificationsApi,
  reportsApi,
  studentsApi,
} from '@/api/services'
import { useAuth } from '@/auth/AuthContext'
import type {
  AttendanceCorrection,
  AttendanceFilters,
  AttendanceRow,
  CorrectionInput,
  EnrollmentSession,
  FingerSlot,
  NotificationStatus,
  ReportFilters,
  StudentFilters,
} from '@/types'

/** Central key factory keeps invalidation precise and typo-proof. */
export const qk = {
  summary: ['dashboard', 'summary'] as const,
  weekly: ['dashboard', 'weekly'] as const,
  absentByDept: ['dashboard', 'absent-by-department'] as const,
  live: ['attendance', 'live'] as const,
  classes: ['classes'] as const,
  students: (f: StudentFilters) => ['students', 'list', f] as const,
  student: (id: string) => ['students', 'detail', id] as const,
  attendance: (f: AttendanceFilters) => ['attendance', 'list', f] as const,
  attendanceAll: ['attendance', 'list'] as const,
  report: (f: ReportFilters) => ['reports', f] as const,
  sheet: (p: { batch: string; from: string; to: string }) => ['reports', 'sheet', p] as const,
  runs: ['notifications', 'runs'] as const,
  notifications: (p: { page: number; status: string }) => ['notifications', 'ledger', p] as const,
  outbox: ['outbox'] as const,
  devices: ['devices'] as const,
  audit: (p: { page: number; action: string }) => ['audit', p] as const,
}

// ---- Dashboard ------------------------------------------------------------

export const useDashboardSummary = () =>
  useQuery({ queryKey: qk.summary, queryFn: dashboardApi.summary, refetchInterval: 30_000 })
export const useWeeklyTrend = () => useQuery({ queryKey: qk.weekly, queryFn: dashboardApi.weekly })
export const useAbsentByDepartment = () => useQuery({ queryKey: qk.absentByDept, queryFn: dashboardApi.absentByDepartment })
export const useLiveScans = () =>
  useQuery({ queryKey: qk.live, queryFn: dashboardApi.live, refetchInterval: 5_000 })

export const useClasses = () => useQuery({ queryKey: qk.classes, queryFn: classesApi.list, staleTime: Infinity })

// ---- Students & enrollment ------------------------------------------------

export const useStudents = (f: StudentFilters) =>
  useQuery({ queryKey: qk.students(f), queryFn: () => studentsApi.list(f), placeholderData: keepPreviousData })

export const useStudent = (id: string | null) =>
  useQuery({ queryKey: qk.student(id ?? ''), queryFn: () => studentsApi.get(id!), enabled: !!id })

export function useStartEnrollment(studentId: string) {
  return useMutation({
    mutationFn: (body: { finger_slot: FingerSlot; device_id: string }) => studentsApi.startEnrollment(studentId, body),
    onError: (e) => toast.error(errorMessage(e, 'Could not start enrollment')),
  })
}

const TERMINAL = new Set(['captured', 'failed', 'timeout'])

/** Polls the enrollment session until the device reports a terminal phase, then refreshes student data. */
export function useEnrollmentSession(session: EnrollmentSession | null) {
  const qc = useQueryClient()
  return useQuery({
    queryKey: ['enrollment-session', session?.id],
    enabled: !!session,
    queryFn: async () => {
      const next = await studentsApi.enrollmentSession(session!.id)
      if (next.phase === 'captured') {
        void qc.invalidateQueries({ queryKey: ['students'] })
        void qc.invalidateQueries({ queryKey: qk.devices })
        toast.success(`Fingerprint ${next.finger_slot} enrolled`)
      }
      return next
    },
    refetchInterval: (q) => (q.state.data && TERMINAL.has(q.state.data.phase) ? false : 1_000),
    initialData: session ?? undefined,
    gcTime: 0,
  })
}

export function useRemoveEnrollment(studentId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (slot: FingerSlot) => studentsApi.removeEnrollment(studentId, slot),
    onSuccess: () => {
      toast.success('Fingerprint removed')
      void qc.invalidateQueries({ queryKey: ['students'] })
    },
    onError: (e) => toast.error(errorMessage(e)),
  })
}

// ---- Attendance -----------------------------------------------------------

export const useAttendance = (f: AttendanceFilters) =>
  useQuery({ queryKey: qk.attendance(f), queryFn: () => attendanceApi.list(f), placeholderData: keepPreviousData })

/**
 * Manual correction with optimistic update: the row flips immediately (with a pending
 * correction entry), rolls back on failure, and always reconciles with the server.
 */
export function useCorrectAttendance() {
  const qc = useQueryClient()
  const { user } = useAuth()

  return useMutation({
    mutationFn: (input: CorrectionInput) => attendanceApi.correct(input),

    onMutate: async (input) => {
      await qc.cancelQueries({ queryKey: qk.attendanceAll })
      const snapshots = qc.getQueriesData<AttendanceRow[]>({ queryKey: qk.attendanceAll })

      qc.setQueriesData<AttendanceRow[]>({ queryKey: qk.attendanceAll }, (rows) =>
        rows?.map((row) => {
          if (row.id !== input.attendance_id) return row
          const optimistic: AttendanceCorrection = {
            id: `optimistic-${Date.now()}`,
            attendance_id: row.id,
            original_status: row.status,
            new_status: input.new_status,
            reason: input.reason,
            corrected_by: user?.id ?? '',
            corrected_by_name: user?.name ?? 'You',
            timestamp: new Date().toISOString(),
          }
          return { ...row, status: input.new_status, corrections: [optimistic, ...row.corrections] }
        }),
      )
      return { snapshots }
    },

    onError: (err, _input, ctx) => {
      ctx?.snapshots.forEach(([key, data]) => qc.setQueryData(key, data))
      toast.error(errorMessage(err, 'Correction failed — change reverted'))
    },

    onSuccess: (row) => toast.success(`${row.student_name} marked ${row.status}`),

    onSettled: () => {
      void qc.invalidateQueries({ queryKey: qk.attendanceAll })
      void qc.invalidateQueries({ queryKey: ['dashboard'] })
      void qc.invalidateQueries({ queryKey: ['audit'] })
    },
  })
}

// ---- Reports --------------------------------------------------------------

export const useReport = (f: ReportFilters) =>
  useQuery({ queryKey: qk.report(f), queryFn: () => reportsApi.summary(f), placeholderData: keepPreviousData })

export const useAttendanceSheet = (p: { batch: string; from: string; to: string }) =>
  useQuery({ queryKey: qk.sheet(p), queryFn: () => reportsApi.attendanceSheet(p), enabled: !!p.from && !!p.to && p.from <= p.to, placeholderData: keepPreviousData })

export function useQueueDefaulterWarnings() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: reportsApi.queueWarnings,
    onSuccess: (r) => {
      toast.success(`${r.queued} warning(s) queued` + (r.duplicates ? `, ${r.duplicates} already sent this month` : '') + (r.skippedNoPhone ? `, ${r.skippedNoPhone} without a valid phone` : ''))
      void qc.invalidateQueries({ queryKey: qk.outbox })
      void qc.invalidateQueries({ queryKey: qk.summary })
    },
    onError: (e) => toast.error(errorMessage(e, 'Could not queue warnings')),
  })
}

export function useSheetsSync() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: reportsApi.syncSheets,
    onSuccess: () => {
      toast.success('Google Sheets sync queued')
      void qc.invalidateQueries({ queryKey: qk.outbox })
      void qc.invalidateQueries({ queryKey: qk.summary })
    },
    onError: (e) => toast.error(errorMessage(e, 'Could not queue sync')),
  })
}

// ---- Notifications & outbox ----------------------------------------------

export const useAbsenceRuns = () => useQuery({ queryKey: qk.runs, queryFn: notificationsApi.runs })

export const useNotifications = (p: { page: number; status: NotificationStatus | '' }) =>
  useQuery({
    queryKey: qk.notifications(p),
    queryFn: () => notificationsApi.list(p),
    placeholderData: keepPreviousData,
    refetchInterval: 20_000,
  })

export const useOutboxStatus = () =>
  useQuery({ queryKey: qk.outbox, queryFn: notificationsApi.outbox, refetchInterval: 15_000 })

export function useRetryNotification() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: notificationsApi.retry,
    onSuccess: () => {
      toast.success('Message re-queued')
      void qc.invalidateQueries({ queryKey: ['notifications'] })
      void qc.invalidateQueries({ queryKey: qk.outbox })
    },
    onError: (e) => toast.error(errorMessage(e, 'Retry failed')),
  })
}

// ---- Devices --------------------------------------------------------------

export const useDevices = () => useQuery({ queryKey: qk.devices, queryFn: devicesApi.list, refetchInterval: 15_000 })

export function useDeviceActions() {
  const qc = useQueryClient()
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: qk.devices })
    void qc.invalidateQueries({ queryKey: qk.summary })
  }
  const onError = (e: unknown) => toast.error(errorMessage(e))
  return {
    regenerate: useMutation({ mutationFn: devicesApi.regenerate, onError }),
    toggleEnrollment: useMutation({
      mutationFn: (v: { id: string; enabled: boolean }) => devicesApi.setEnrollmentMode(v.id, v.enabled),
      onSuccess: (d) => {
        toast.success(`Enrollment mode ${d.enrollment_mode ? 'enabled' : 'disabled'} on ${d.location}`)
        refresh()
      },
      onError,
    }),
    revoke: useMutation({
      mutationFn: devicesApi.revoke,
      onSuccess: (d) => {
        toast.success(`${d.device_id} revoked`)
        refresh()
      },
      onError,
    }),
  }
}

// ---- Audit ----------------------------------------------------------------

export const useAudit = (p: { page: number; action: string }) =>
  useQuery({ queryKey: qk.audit(p), queryFn: () => auditApi.list(p), placeholderData: keepPreviousData })
