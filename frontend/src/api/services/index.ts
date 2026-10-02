import type { WarningSummary } from '@/report-engine/defaulters'
import type { AttendanceReport } from '@/report-engine/types'
import { api } from '../client'
import type {
  AbsenceRun,
  AttendanceFilters,
  AttendanceRow,
  AuditEvent,
  ClassInfo,
  CorrectionInput,
  DashboardSummary,
  DepartmentAbsence,
  Device,
  EnrollmentSession,
  FingerSlot,
  LiveScan,
  LoginResponse,
  Notification,
  NotificationStatus,
  Paginated,
  ReportFilters,
  ReportSummary,
  StudentDetail,
  StudentFilters,
  StudentListItem,
  User,
  WeeklyPoint,
} from '@/types'

const data = <T,>(p: Promise<{ data: T }>) => p.then((r) => r.data)

export const authApi = {
  login: (email: string, password: string) => data<LoginResponse>(api.post('/auth/login', { email, password })),
  me: () => data<User>(api.get('/auth/me')),
  logout: () => data<{ ok: boolean }>(api.post('/auth/logout')),
}

export const dashboardApi = {
  summary: () => data<DashboardSummary>(api.get('/dashboard/summary')),
  weekly: () => data<WeeklyPoint[]>(api.get('/dashboard/weekly')),
  absentByDepartment: () => data<DepartmentAbsence[]>(api.get('/dashboard/absent-by-department')),
  live: () => data<LiveScan[]>(api.get('/attendance/live')),
}

export const classesApi = {
  list: () => data<ClassInfo[]>(api.get('/classes')),
}

export const studentsApi = {
  list: (f: StudentFilters) => data<Paginated<StudentListItem>>(api.get('/students', { params: f })),
  get: (id: string) => data<StudentDetail>(api.get(`/students/${id}`)),
  startEnrollment: (studentId: string, body: { finger_slot: FingerSlot; device_id: string }) =>
    data<EnrollmentSession>(api.post(`/students/${studentId}/enrollments/start`, body)),
  enrollmentSession: (sessionId: string) => data<EnrollmentSession>(api.get(`/enrollment-sessions/${sessionId}`)),
  removeEnrollment: (studentId: string, slot: FingerSlot) => data(api.delete(`/students/${studentId}/enrollments/${slot}`)),
}

export const attendanceApi = {
  list: (f: AttendanceFilters) => data<AttendanceRow[]>(api.get('/attendance', { params: f })),
  correct: ({ attendance_id, ...body }: CorrectionInput) =>
    data<AttendanceRow>(api.post(`/attendance/${attendance_id}/corrections`, body)),
}

export const reportsApi = {
  summary: (f: ReportFilters) => data<ReportSummary>(api.get('/reports/summary', { params: f })),
  attendanceSheet: (p: { batch: string; from: string; to: string }) => data<AttendanceReport>(api.get('/reports/attendance-sheet', { params: p })),
  queueWarnings: (p: { batch: string; from: string; to: string }) => data<WarningSummary>(api.post('/reports/defaulter-warnings', p)),
  syncSheets: () => data<{ queued: boolean }>(api.post('/reports/sheets-sync')),
}

export const notificationsApi = {
  runs: () => data<AbsenceRun[]>(api.get('/notifications/runs')),
  list: (p: { page: number; status: NotificationStatus | '' }) => data<Paginated<Notification>>(api.get('/notifications', { params: p })),
  retry: (id: string) => data<Notification>(api.post(`/notifications/${id}/retry`)),
  outbox: () => data<{ whatsapp_pending: number; sheets_pending: number; failed: number }>(api.get('/outbox/summary')),
}

export const devicesApi = {
  list: () => data<Device[]>(api.get('/devices')),
  regenerate: (id: string) => data<{ device_id: string; secret: string }>(api.post(`/devices/${id}/credentials`)),
  setEnrollmentMode: (id: string, enabled: boolean) => data<Device>(api.post(`/devices/${id}/enrollment-mode`, { enabled })),
  revoke: (id: string) => data<Device>(api.post(`/devices/${id}/revoke`)),
}

export const auditApi = {
  list: (p: { page: number; action: string }) => data<Paginated<AuditEvent>>(api.get('/audit', { params: p })),
}
