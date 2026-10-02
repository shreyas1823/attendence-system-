/** Types mirror the PostgreSQL schema (snake_case) and the REST response envelopes. */

export type Role = 'admin' | 'operator' | 'viewer'
export type AttendanceStatus = 'present' | 'absent'
export type FingerSlot = 1 | 2
export type DeviceStatus = 'online' | 'offline'
export type NotificationStatus = 'queued' | 'sent' | 'delivered' | 'failed'
export type OutboxJobType = 'SHEETS_SYNC' | 'WHATSAPP_MSG'
export type OutboxJobStatus = 'pending' | 'processing' | 'done' | 'failed'

// ---- Table rows -----------------------------------------------------------

export interface User {
  id: string
  email: string
  name: string
  role: Role
}

export interface Student {
  id: string
  student_id: string // roll number
  name: string
  class_id: string
  parent_phone: string
  status: 'active' | 'inactive'
  created_at: string
}

export interface FingerprintEnrollment {
  id: string
  student_id: string
  finger_slot: FingerSlot
  template_hash: string
  enrolled_at: string
}

export interface AttendanceRecord {
  id: string
  student_id: string
  scan_time_1: string | null // check-in (ISO)
  scan_time_2: string | null // check-out (ISO)
  status: AttendanceStatus
  attendance_date: string // YYYY-MM-DD
}

export interface AttendanceCorrection {
  id: string
  attendance_id: string
  original_status: AttendanceStatus
  new_status: AttendanceStatus
  reason: string
  corrected_by: string
  corrected_by_name: string
  timestamp: string
}

export interface Device {
  id: string
  device_id: string // MAC / hardware id
  name: string // e.g. ESP8266 node id
  location: string
  last_heartbeat: string | null
  status: DeviceStatus
  enrollment_mode: boolean
  revoked: boolean
}

export interface AbsenceRun {
  id: string
  run_date: string
  total_absent: number
  notification_triggered_at: string | null
  sent: number
  failed: number
}

export interface NotificationAttempt {
  id: string
  at: string
  status: NotificationStatus
  error_log: string | null
}

export interface Notification {
  id: string
  student_id: string
  student_name: string
  parent_phone: string
  channel: 'WhatsApp'
  payload: string
  status: NotificationStatus
  error_log: string | null
  attempts: NotificationAttempt[]
  created_at: string
}

export interface OutboxJob {
  id: string
  job_type: OutboxJobType
  status: OutboxJobStatus
  retry_count: number
}

export interface AuditEvent {
  id: string
  actor_id: string
  actor_name: string
  action: string
  entity: string
  entity_id: string | null
  detail: string
  created_at: string
}

// ---- Composite / view models ---------------------------------------------

export interface ClassInfo {
  id: string
  name: string
  department: string
}

export interface StudentListItem extends Student {
  class_name: string
  department: string
  enrolled_slots: FingerSlot[]
}

export interface StudentDetail extends StudentListItem {
  enrollments: FingerprintEnrollment[]
}

export interface AttendanceRow extends AttendanceRecord {
  student_name: string
  roll_no: string
  class_name: string
  department: string
  corrections: AttendanceCorrection[]
}

export interface LiveScan {
  id: string
  student_name: string
  class_name: string
  scan_time: string
  slot: 'check_in' | 'check_out' | 'rejected'
  finger_slot: FingerSlot
  device_name: string
}

export interface DashboardSummary {
  attendance_pct: number
  present: number
  absent: number
  total_students: number
  devices_online: number
  devices_total: number
  pending_whatsapp_jobs: number
  pending_sheets_jobs: number
}

export interface WeeklyPoint {
  day: string
  present: number
  absent: number
}

export interface DepartmentAbsence {
  department: string
  absent: number
}

export interface ReportRow {
  student_id: string
  roll_no: string
  name: string
  class_name: string
  department: string
  days_present: number
  days_total: number
  attendance_pct: number
}

export interface ReportSummary {
  from: string
  to: string
  average_pct: number
  rows: ReportRow[]
}

export type EnrollmentPhase = 'waiting' | 'captured_first' | 'captured' | 'failed' | 'timeout'

export interface EnrollmentSession {
  id: string
  student_id: string
  device_id: string
  finger_slot: FingerSlot
  phase: EnrollmentPhase
  message: string
}

// ---- Envelopes ------------------------------------------------------------

export interface Paginated<T> {
  data: T[]
  page: number
  page_size: number
  total: number
}

export interface LoginResponse {
  access_token: string
  user: User
}

export interface ApiError {
  message: string
  code?: string
}

// ---- Query params ---------------------------------------------------------

export interface StudentFilters {
  page: number
  search: string
  class_id: string
}

export interface AttendanceFilters {
  date: string
  class_id: string
  status: AttendanceStatus | ''
}

export interface ReportFilters {
  from: string
  to: string
  department: string
  max_pct: number
}

export interface CorrectionInput {
  attendance_id: string
  new_status: AttendanceStatus
  reason: string
}
