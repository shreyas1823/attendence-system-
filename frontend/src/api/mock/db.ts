/**
 * In-memory stand-in for the Fastify + PostgreSQL backend, used when VITE_USE_MOCK=true.
 * Deterministic seed so screens and tests are stable; state resets on page reload.
 */
import { toDateInput } from '@/lib/format'
import type {
  AbsenceRun,
  AttendanceCorrection,
  AttendanceRecord,
  AuditEvent,
  ClassInfo,
  Device,
  FingerprintEnrollment,
  Notification,
  OutboxJob,
  Student,
  User,
} from '@/types'

function rng(seed: number) {
  let s = seed
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296
    return s / 4294967296
  }
}
const rand = rng(42)
const pick = <T,>(arr: T[]) => arr[Math.floor(rand() * arr.length)]
const minutesAgo = (m: number) => new Date(Date.now() - m * 60_000).toISOString()
let idCounter = 1000
export const nextId = (prefix: string) => `${prefix}_${++idCounter}`

export const users: (User & { password: string })[] = [
  { id: 'u1', email: 'admin@school.edu', name: 'Asha Rao', role: 'admin', password: 'admin123' },
  { id: 'u2', email: 'operator@school.edu', name: 'Ravi Menon', role: 'operator', password: 'operator123' },
  { id: 'u3', email: 'viewer@school.edu', name: 'Neha Iyer', role: 'viewer', password: 'viewer123' },
]

export const classes: ClassInfo[] = [
  { id: 'c1', name: 'CSE-A', department: 'Computer Science' },
  { id: 'c2', name: 'CSE-B', department: 'Computer Science' },
  { id: 'c3', name: 'ECE-A', department: 'Electronics' },
  { id: 'c4', name: 'ECE-B', department: 'Electronics' },
  { id: 'c5', name: 'MECH-A', department: 'Mechanical' },
  { id: 'c6', name: 'CIVIL-A', department: 'Civil' },
]

const first = ['Aarav', 'Diya', 'Kabir', 'Meera', 'Rohan', 'Isha', 'Arjun', 'Sana', 'Vihaan', 'Anaya', 'Dev', 'Tara', 'Nikhil', 'Pooja', 'Yash', 'Riya']
const last = ['Sharma', 'Patil', 'Nair', 'Kulkarni', 'Reddy', 'Khan', 'Joshi', 'Das', 'Gupta', 'Mehta']

export const students: Student[] = Array.from({ length: 48 }, (_, i) => ({
  id: `s${i + 1}`,
  student_id: `${2400 + i + 1}`,
  name: `${first[i % first.length]} ${last[(i * 3) % last.length]}`,
  class_id: classes[i % classes.length].id,
  parent_phone: `+91 98${String(10000000 + Math.floor(rand() * 89999999))}`,
  status: 'active',
  created_at: minutesAgo(60 * 24 * (90 - i)),
}))

export const enrollments: FingerprintEnrollment[] = []
students.forEach((s, i) => {
  if (i % 7 !== 0) {
    enrollments.push({ id: nextId('fe'), student_id: s.id, finger_slot: 1, template_hash: `sha256:${(i * 7919).toString(16).padStart(8, '0')}`, enrolled_at: s.created_at })
  }
  if (i % 3 === 0 && i % 7 !== 0) {
    enrollments.push({ id: nextId('fe'), student_id: s.id, finger_slot: 2, template_hash: `sha256:${(i * 104729).toString(16).padStart(8, '0')}`, enrolled_at: s.created_at })
  }
})

export const devices: Device[] = [
  { id: 'd1', device_id: 'DEV-ESP-001', name: 'ESP8266-A1 (A4:CF:12:9B:01:7E)', location: 'Main Gate', last_heartbeat: minutesAgo(0.2), status: 'online', enrollment_mode: false, revoked: false },
  { id: 'd2', device_id: 'DEV-ESP-002', name: 'ESP8266-B2 (A4:CF:12:9B:44:21)', location: 'CSE Block', last_heartbeat: minutesAgo(0.5), status: 'online', enrollment_mode: false, revoked: false },
  { id: 'd3', device_id: 'DEV-ESP-003', name: 'ESP8266-C3 (BC:DD:C2:0A:91:F0)', location: 'ECE Block', last_heartbeat: minutesAgo(47), status: 'offline', enrollment_mode: false, revoked: false },
  { id: 'd4', device_id: 'DEV-ESP-004', name: 'ESP8266-D4 (5C:CF:7F:33:08:AA)', location: 'Library', last_heartbeat: minutesAgo(0.8), status: 'online', enrollment_mode: false, revoked: false },
]

export const attendance: AttendanceRecord[] = []
export const corrections: AttendanceCorrection[] = []

const today = new Date()
const habit = new Map<string, number>(students.map((s, i) => [s.id, i % 9 === 4 ? 0.5 : 0.93]))
for (let back = 0; back < 30; back++) {
  const d = new Date(today)
  d.setDate(today.getDate() - back)
  const date = toDateInput(d)
  for (const s of students) {
    const present = rand() < (habit.get(s.id) ?? 0.9)
    let in1: string | null = null
    let in2: string | null = null
    if (present) {
      if (back === 0) {
        const m = 20 + Math.floor(rand() * 200)
        in1 = minutesAgo(m)
        if (rand() < 0.2) in2 = minutesAgo(Math.max(1, m - 90))
      } else {
        const a = new Date(d)
        a.setHours(8, Math.floor(rand() * 40), 0, 0)
        in1 = a.toISOString()
        const b = new Date(d)
        b.setHours(15, 30 + Math.floor(rand() * 30), 0, 0)
        in2 = b.toISOString()
      }
    }
    attendance.push({ id: `a_${date}_${s.id}`, student_id: s.id, scan_time_1: in1, scan_time_2: in2, status: present ? 'present' : 'absent', attendance_date: date })
  }
}

// One historical correction so the history UI has something to show.
{
  const rec = attendance.find((a) => a.status === 'present' && a.attendance_date !== toDateInput(today))
  if (rec) {
    corrections.push({
      id: nextId('ac'),
      attendance_id: rec.id,
      original_status: 'absent',
      new_status: 'present',
      reason: 'Sensor retry failed at gate; verified by class teacher',
      corrected_by: 'u2',
      corrected_by_name: 'Ravi Menon',
      timestamp: minutesAgo(60 * 26),
    })
  }
}

export const absenceRuns: AbsenceRun[] = Array.from({ length: 6 }, (_, i) => {
  const d = new Date(today)
  d.setDate(today.getDate() - i - 1)
  const total = 3 + Math.floor(rand() * 8)
  return { id: `ar${i + 1}`, run_date: toDateInput(d), total_absent: total, notification_triggered_at: new Date(d.setHours(16, 5, 0, 0)).toISOString(), sent: total - (i === 1 ? 2 : 0), failed: i === 1 ? 2 : 0 }
})

const errors = ['Recipient phone number not on WhatsApp', 'Template parameter mismatch (#132000)', 'Rate limit hit (#130429); will retry']
export const notifications: Notification[] = Array.from({ length: 28 }, (_, i) => {
  const s = students[(i * 5) % students.length]
  const roll = rand()
  const status = roll < 0.15 ? 'failed' : roll < 0.3 ? 'queued' : roll < 0.6 ? 'sent' : 'delivered'
  const err = status === 'failed' ? pick(errors) : null
  const created = minutesAgo(30 + i * 45)
  return {
    id: `n${i + 1}`,
    student_id: s.id,
    student_name: s.name,
    parent_phone: s.parent_phone,
    channel: 'WhatsApp',
    payload: `Dear parent, ${s.name} was marked absent today.`,
    status,
    error_log: err,
    created_at: created,
    attempts: [{ id: `na${i + 1}`, at: created, status, error_log: err }],
  }
})

export const outbox: OutboxJob[] = [
  ...Array.from({ length: 5 }, (_, i): OutboxJob => ({ id: `o${i + 1}`, job_type: 'WHATSAPP_MSG', status: 'pending', retry_count: 0 })),
  { id: 'o6', job_type: 'WHATSAPP_MSG', status: 'failed', retry_count: 3 },
  { id: 'o7', job_type: 'SHEETS_SYNC', status: 'pending', retry_count: 1 },
  { id: 'o8', job_type: 'SHEETS_SYNC', status: 'done', retry_count: 0 },
]

export const audit: AuditEvent[] = [
  ['u2', 'Ravi Menon', 'attendance.corrected', 'attendance_records', 'a_1', 'Absent → Present (sensor retry failed)'],
  ['u1', 'Asha Rao', 'device.revoked', 'devices', 'd9', 'Revoked DEV-ESP-009 (lost unit)'],
  ['u2', 'Ravi Menon', 'fingerprint.enrolled', 'fingerprint_enrollments', 's3', 'Slot 1 enrolled for Kabir Nair'],
  ['u1', 'Asha Rao', 'settings.changed', 'settings', null, 'Absence notification time set to 16:00'],
  ['u1', 'Asha Rao', 'device.credentials_regenerated', 'devices', 'd2', 'Credentials rotated for DEV-ESP-002'],
  ['u2', 'Ravi Menon', 'student.created', 'students', 's48', 'Registered new student'],
].map(([actor_id, actor_name, action, entity, entity_id, detail], i) => ({
  id: `ae${i + 1}`,
  actor_id: actor_id as string,
  actor_name: actor_name as string,
  action: action as string,
  entity: entity as string,
  entity_id: entity_id as string | null,
  detail: detail as string,
  created_at: minutesAgo(90 + i * 240),
}))

export function writeAudit(actor: User, action: string, entity: string, entity_id: string | null, detail: string) {
  audit.unshift({ id: nextId('ae'), actor_id: actor.id, actor_name: actor.name, action, entity, entity_id, detail, created_at: new Date().toISOString() })
}

export const classOf = (id: string) => classes.find((c) => c.id === id)!
export const studentOf = (id: string) => students.find((s) => s.id === id)!
export const todayStr = () => toDateInput(new Date())
