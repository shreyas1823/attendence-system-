/** Axios adapter that serves the REST contract from the in-memory mock DB. */
import { AxiosError, type AxiosAdapter, type AxiosResponse, type InternalAxiosRequestConfig } from 'axios'
import { toDateInput } from '@/lib/format'
import type {
  AttendanceRow,
  AttendanceStatus,
  DashboardSummary,
  EnrollmentSession,
  FingerSlot,
  LiveScan,
  NotificationStatus,
  ReportRow,
  Role,
  StudentDetail,
  StudentListItem,
  User,
} from '@/types'
import { queueDefaulterWarnings } from '@/report-engine/defaulters'
import * as db from './db'
import { queuedWarningKeys, sheetReport } from './batch'

interface Ctx {
  params: string[]
  query: Record<string, string>
  body: Record<string, unknown>
  user: User | null
}
type Handler = (ctx: Ctx) => unknown | Promise<unknown>

class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message)
  }
}

const RANK: Record<Role, number> = { viewer: 0, operator: 1, admin: 2 }
const TOKEN_PREFIX = 'mock.'

function userFromHeader(config: InternalAxiosRequestConfig): User | null {
  const raw = config.headers?.get?.('Authorization')
  const token = typeof raw === 'string' ? raw.replace('Bearer ', '') : ''
  if (!token.startsWith(TOKEN_PREFIX)) return null
  const u = db.users.find((x) => x.id === token.slice(TOKEN_PREFIX.length))
  return u ? { id: u.id, email: u.email, name: u.name, role: u.role } : null
}

function need(ctx: Ctx, role: Role): User {
  if (!ctx.user) throw new HttpError(401, 'Not authenticated')
  if (RANK[ctx.user.role] < RANK[role]) throw new HttpError(403, `Requires ${role} role`)
  return ctx.user
}

// ---- helpers --------------------------------------------------------------

function listStudent(id: string): StudentListItem {
  const s = db.studentOf(id)
  const cls = db.classOf(s.class_id)
  return {
    ...s,
    class_name: cls.name,
    department: cls.department,
    enrolled_slots: db.enrollments.filter((e) => e.student_id === id).map((e) => e.finger_slot).sort() as FingerSlot[],
  }
}

function attendanceRow(a: (typeof db.attendance)[number]): AttendanceRow {
  const s = db.studentOf(a.student_id)
  const cls = db.classOf(s.class_id)
  return {
    ...a,
    student_name: s.name,
    roll_no: s.student_id,
    class_name: cls.name,
    department: cls.department,
    corrections: db.corrections.filter((c) => c.attendance_id === a.id).sort((x, y) => y.timestamp.localeCompare(x.timestamp)),
  }
}

function paginate<T>(items: T[], query: Record<string, string>, size = 10) {
  const page = Math.max(1, Number(query.page) || 1)
  return { data: items.slice((page - 1) * size, page * size), page, page_size: size, total: items.length }
}

const sessions = new Map<string, { startedAt: number; session: EnrollmentSession; committed: boolean }>()

function sessionState(id: string): EnrollmentSession {
  const entry = sessions.get(id)
  if (!entry) throw new HttpError(404, 'Enrollment session not found')
  const elapsed = Date.now() - entry.startedAt
  const s = entry.session
  if (elapsed < 1800) {
    s.phase = 'waiting'
    s.message = 'Place the finger on the sensor'
  } else if (elapsed < 3600) {
    s.phase = 'captured_first'
    s.message = 'First capture OK — lift and place the same finger again'
  } else {
    s.phase = 'captured'
    s.message = 'Fingerprint enrolled and linked'
    if (!entry.committed) {
      entry.committed = true
      db.enrollments.push({
        id: db.nextId('fe'),
        student_id: s.student_id,
        finger_slot: s.finger_slot,
        template_hash: `sha256:${Math.floor(Math.random() * 1e12).toString(16)}`,
        enrolled_at: new Date().toISOString(),
      })
      const dev = db.devices.find((d) => d.id === s.device_id)
      if (dev) dev.enrollment_mode = false
    }
  }
  return { ...s }
}

// ---- routes ---------------------------------------------------------------

const routes: [string, RegExp, Handler][] = [
  [
    'POST',
    /^\/auth\/login$/,
    ({ body }) => {
      const u = db.users.find((x) => x.email === body.email && x.password === body.password)
      if (!u) throw new HttpError(401, 'Invalid email or password')
      return { access_token: `${TOKEN_PREFIX}${u.id}`, user: { id: u.id, email: u.email, name: u.name, role: u.role } }
    },
  ],
  ['GET', /^\/auth\/me$/, (ctx) => need(ctx, 'viewer')],
  ['POST', /^\/auth\/logout$/, () => ({ ok: true })],
  ['GET', /^\/classes$/, (ctx) => (need(ctx, 'viewer'), db.classes)],

  [
    'GET',
    /^\/dashboard\/summary$/,
    (ctx): DashboardSummary => {
      need(ctx, 'viewer')
      const rows = db.attendance.filter((a) => a.attendance_date === db.todayStr())
      const present = rows.filter((r) => r.status === 'present').length
      return {
        attendance_pct: Math.round((present / rows.length) * 1000) / 10,
        present,
        absent: rows.length - present,
        total_students: rows.length,
        devices_online: db.devices.filter((d) => d.status === 'online' && !d.revoked).length,
        devices_total: db.devices.length,
        pending_whatsapp_jobs: db.outbox.filter((j) => j.job_type === 'WHATSAPP_MSG' && j.status === 'pending').length,
        pending_sheets_jobs: db.outbox.filter((j) => j.job_type === 'SHEETS_SYNC' && j.status === 'pending').length,
      }
    },
  ],
  [
    'GET',
    /^\/dashboard\/weekly$/,
    (ctx) => {
      need(ctx, 'viewer')
      return Array.from({ length: 7 }, (_, i) => {
        const d = new Date()
        d.setDate(d.getDate() - (6 - i))
        const rows = db.attendance.filter((a) => a.attendance_date === toDateInput(d))
        const present = rows.filter((r) => r.status === 'present').length
        return { day: d.toLocaleDateString(undefined, { weekday: 'short' }), present, absent: rows.length - present }
      })
    },
  ],
  [
    'GET',
    /^\/dashboard\/absent-by-department$/,
    (ctx) => {
      need(ctx, 'viewer')
      const out = new Map<string, number>()
      db.attendance
        .filter((a) => a.attendance_date === db.todayStr() && a.status === 'absent')
        .forEach((a) => {
          const dep = db.classOf(db.studentOf(a.student_id).class_id).department
          out.set(dep, (out.get(dep) ?? 0) + 1)
        })
      return [...out].map(([department, absent]) => ({ department, absent }))
    },
  ],
  [
    'GET',
    /^\/attendance\/live$/,
    (ctx): LiveScan[] => {
      need(ctx, 'viewer')
      const today = db.todayStr()
      // Simulate a device scan arriving between polls so the feed visibly moves.
      if (Math.random() < 0.35) {
        const absent = db.attendance.filter((a) => a.attendance_date === today && a.status === 'absent')
        const hit = absent[Math.floor(Math.random() * absent.length)]
        if (hit) {
          hit.status = 'present'
          hit.scan_time_1 = new Date().toISOString()
        }
      }
      return db.attendance
        .filter((a) => a.attendance_date === today && a.scan_time_1)
        .flatMap((a) => {
          const s = db.studentOf(a.student_id)
          const base = { student_name: s.name, class_name: db.classOf(s.class_id).name, finger_slot: (1 + (s.id.length % 2)) as FingerSlot, device_name: db.devices[a.student_id.length % 3].location }
          const out: LiveScan[] = [{ ...base, id: `${a.id}:1`, scan_time: a.scan_time_1!, slot: 'check_in' }]
          if (a.scan_time_2) out.push({ ...base, id: `${a.id}:2`, scan_time: a.scan_time_2, slot: 'check_out' })
          return out
        })
        .sort((x, y) => y.scan_time.localeCompare(x.scan_time))
        .slice(0, 12)
    },
  ],

  [
    'GET',
    /^\/students$/,
    (ctx) => {
      need(ctx, 'viewer')
      const q = (ctx.query.search ?? '').toLowerCase()
      const items = db.students
        .map((s) => listStudent(s.id))
        .filter((s) => (!ctx.query.class_id || s.class_id === ctx.query.class_id) && (!q || s.name.toLowerCase().includes(q) || s.student_id.includes(q)))
      return paginate(items, ctx.query)
    },
  ],
  [
    'GET',
    /^\/students\/([^/]+)$/,
    (ctx): StudentDetail => {
      need(ctx, 'viewer')
      if (!db.students.find((s) => s.id === ctx.params[0])) throw new HttpError(404, 'Student not found')
      return { ...listStudent(ctx.params[0]), enrollments: db.enrollments.filter((e) => e.student_id === ctx.params[0]) }
    },
  ],
  [
    'POST',
    /^\/students\/([^/]+)\/enrollments\/start$/,
    (ctx) => {
      const user = need(ctx, 'operator')
      const slot = Number(ctx.body.finger_slot) as FingerSlot
      const device = db.devices.find((d) => d.id === ctx.body.device_id)
      if (!device || device.status !== 'online' || device.revoked) throw new HttpError(409, 'Selected device is offline or revoked')
      if (db.enrollments.some((e) => e.student_id === ctx.params[0] && e.finger_slot === slot)) throw new HttpError(409, `Slot ${slot} is already enrolled`)
      device.enrollment_mode = true
      const session: EnrollmentSession = { id: db.nextId('es'), student_id: ctx.params[0], device_id: device.id, finger_slot: slot, phase: 'waiting', message: 'Place the finger on the sensor' }
      sessions.set(session.id, { startedAt: Date.now(), session, committed: false })
      db.writeAudit(user, 'fingerprint.enrollment_started', 'fingerprint_enrollments', ctx.params[0], `Slot ${slot} on ${device.device_id}`)
      return session
    },
  ],
  ['GET', /^\/enrollment-sessions\/([^/]+)$/, (ctx) => (need(ctx, 'operator'), sessionState(ctx.params[0]))],
  [
    'DELETE',
    /^\/students\/([^/]+)\/enrollments\/(\d)$/,
    (ctx) => {
      const user = need(ctx, 'admin')
      const idx = db.enrollments.findIndex((e) => e.student_id === ctx.params[0] && e.finger_slot === Number(ctx.params[1]))
      if (idx < 0) throw new HttpError(404, 'Enrollment not found')
      db.enrollments.splice(idx, 1)
      db.writeAudit(user, 'fingerprint.removed', 'fingerprint_enrollments', ctx.params[0], `Slot ${ctx.params[1]} removed`)
      return { ok: true }
    },
  ],

  [
    'GET',
    /^\/attendance$/,
    (ctx) => {
      need(ctx, 'viewer')
      const date = ctx.query.date || db.todayStr()
      return db.attendance
        .filter((a) => a.attendance_date === date)
        .map(attendanceRow)
        .filter((r) => (!ctx.query.class_id || db.studentOf(r.student_id).class_id === ctx.query.class_id) && (!ctx.query.status || r.status === ctx.query.status))
        .sort((a, b) => a.roll_no.localeCompare(b.roll_no))
    },
  ],
  [
    'POST',
    /^\/attendance\/([^/]+)\/corrections$/,
    (ctx) => {
      const user = need(ctx, 'operator')
      const rec = db.attendance.find((a) => a.id === ctx.params[0])
      if (!rec) throw new HttpError(404, 'Attendance record not found')
      const reason = String(ctx.body.reason ?? '').trim()
      const next = ctx.body.new_status as AttendanceStatus
      if (reason.length < 10) throw new HttpError(422, 'Reason must be at least 10 characters')
      if (next === rec.status) throw new HttpError(422, `Record is already ${next}`)
      db.corrections.push({ id: db.nextId('ac'), attendance_id: rec.id, original_status: rec.status, new_status: next, reason, corrected_by: user.id, corrected_by_name: user.name, timestamp: new Date().toISOString() })
      db.writeAudit(user, 'attendance.corrected', 'attendance_records', rec.id, `${rec.status} → ${next}: ${reason}`)
      rec.status = next
      return attendanceRow(rec)
    },
  ],

  [
    'GET',
    /^\/reports\/summary$/,
    (ctx) => {
      need(ctx, 'viewer')
      const { from, to, department = '', max_pct = '100' } = ctx.query
      const inRange = db.attendance.filter((a) => a.attendance_date >= from && a.attendance_date <= to)
      const rows: ReportRow[] = db.students
        .map((s) => {
          const recs = inRange.filter((a) => a.student_id === s.id)
          const present = recs.filter((r) => r.status === 'present').length
          const cls = db.classOf(s.class_id)
          return { student_id: s.id, roll_no: s.student_id, name: s.name, class_name: cls.name, department: cls.department, days_present: present, days_total: recs.length, attendance_pct: recs.length ? Math.round((present / recs.length) * 1000) / 10 : 0 }
        })
        .filter((r) => (!department || r.department === department) && r.attendance_pct <= Number(max_pct))
        .sort((a, b) => a.attendance_pct - b.attendance_pct)
      const avg = rows.length ? Math.round((rows.reduce((t, r) => t + r.attendance_pct, 0) / rows.length) * 10) / 10 : 0
      return { from, to, average_pct: avg, rows }
    },
  ],
  [
    'GET',
    /^\/reports\/attendance-sheet$/,
    (ctx) => {
      need(ctx, 'viewer')
      const { from, to } = ctx.query
      if (!from || !to || from > to) throw new HttpError(422, 'Provide a valid from/to date range')
      if (ctx.query.batch && ctx.query.batch !== 'T1') throw new HttpError(404, 'Unknown batch')
      return sheetReport(from, to)
    },
  ],
  [
    'POST',
    /^\/reports\/defaulter-warnings$/,
    async (ctx) => {
      const user = need(ctx, 'operator')
      const { from, to } = ctx.body as { from?: string; to?: string }
      if (!from || !to || from > to) throw new HttpError(422, 'Provide a valid from/to date range')
      const summary = await queueDefaulterWarnings(sheetReport(from, to), async (job) => {
        if (queuedWarningKeys.has(job.idempotencyKey)) return 'duplicate'
        queuedWarningKeys.add(job.idempotencyKey)
        db.outbox.push({ id: db.nextId('o'), job_type: 'WHATSAPP_MSG', status: 'pending', retry_count: 0 })
        return 'queued'
      })
      db.writeAudit(user, 'notification.defaulter_warnings', 'outbox_jobs', null, `${summary.queued} guardian warnings queued (${from} to ${to})`)
      return summary
    },
  ],
  [
    'POST',
    /^\/reports\/sheets-sync$/,
    (ctx) => {
      const user = need(ctx, 'operator')
      db.outbox.push({ id: db.nextId('o'), job_type: 'SHEETS_SYNC', status: 'pending', retry_count: 0 })
      db.writeAudit(user, 'sheets.sync_requested', 'outbox_jobs', null, 'On-demand Google Sheets synchronisation')
      return { queued: true }
    },
  ],

  ['GET', /^\/notifications\/runs$/, (ctx) => (need(ctx, 'viewer'), db.absenceRuns)],
  [
    'GET',
    /^\/notifications$/,
    (ctx) => {
      need(ctx, 'viewer')
      const status = ctx.query.status as NotificationStatus | undefined
      return paginate(db.notifications.filter((n) => !status || n.status === status), ctx.query)
    },
  ],
  [
    'POST',
    /^\/notifications\/([^/]+)\/retry$/,
    (ctx) => {
      const user = need(ctx, 'operator')
      const n = db.notifications.find((x) => x.id === ctx.params[0])
      if (!n) throw new HttpError(404, 'Notification not found')
      if (n.status !== 'failed') throw new HttpError(409, 'Only failed notifications can be retried')
      n.status = 'queued'
      n.error_log = null
      n.attempts.push({ id: db.nextId('na'), at: new Date().toISOString(), status: 'queued', error_log: null })
      db.writeAudit(user, 'notification.retried', 'notifications', n.id, `Retry for ${n.student_name}`)
      return n
    },
  ],
  [
    'GET',
    /^\/outbox\/summary$/,
    (ctx) => {
      need(ctx, 'viewer')
      return {
        whatsapp_pending: db.outbox.filter((j) => j.job_type === 'WHATSAPP_MSG' && j.status === 'pending').length,
        sheets_pending: db.outbox.filter((j) => j.job_type === 'SHEETS_SYNC' && j.status === 'pending').length,
        failed: db.outbox.filter((j) => j.status === 'failed').length,
      }
    },
  ],

  ['GET', /^\/devices$/, (ctx) => (need(ctx, 'viewer'), db.devices)],
  [
    'POST',
    /^\/devices\/([^/]+)\/credentials$/,
    (ctx) => {
      const user = need(ctx, 'admin')
      const d = db.devices.find((x) => x.id === ctx.params[0])
      if (!d) throw new HttpError(404, 'Device not found')
      db.writeAudit(user, 'device.credentials_regenerated', 'devices', d.id, `Credentials rotated for ${d.device_id}`)
      return { device_id: d.device_id, secret: `dsk_${Math.random().toString(36).slice(2)}${Math.random().toString(36).slice(2)}` }
    },
  ],
  [
    'POST',
    /^\/devices\/([^/]+)\/enrollment-mode$/,
    (ctx) => {
      const user = need(ctx, 'operator')
      const d = db.devices.find((x) => x.id === ctx.params[0])
      if (!d) throw new HttpError(404, 'Device not found')
      if (d.status !== 'online' || d.revoked) throw new HttpError(409, 'Device must be online and active')
      d.enrollment_mode = Boolean(ctx.body.enabled)
      db.writeAudit(user, 'device.enrollment_mode', 'devices', d.id, `${d.device_id} enrollment mode ${d.enrollment_mode ? 'on' : 'off'}`)
      return d
    },
  ],
  [
    'POST',
    /^\/devices\/([^/]+)\/revoke$/,
    (ctx) => {
      const user = need(ctx, 'admin')
      const d = db.devices.find((x) => x.id === ctx.params[0])
      if (!d) throw new HttpError(404, 'Device not found')
      d.revoked = true
      d.enrollment_mode = false
      db.writeAudit(user, 'device.revoked', 'devices', d.id, `Revoked ${d.device_id}`)
      return d
    },
  ],

  [
    'GET',
    /^\/audit$/,
    (ctx) => {
      need(ctx, 'admin')
      const action = ctx.query.action
      return paginate(db.audit.filter((a) => !action || a.action.startsWith(action)), ctx.query, 15)
    },
  ],
]

// ---- adapter --------------------------------------------------------------

export const mockAdapter: AxiosAdapter = async (config) => {
  await new Promise((r) => setTimeout(r, 120 + Math.random() * 180))

  const url = (config.url ?? '').split('?')[0]
  const method = (config.method ?? 'get').toUpperCase()
  const query: Record<string, string> = {}
  for (const [k, v] of Object.entries(config.params ?? {})) if (v !== undefined && v !== null && v !== '') query[k] = String(v)
  const body = typeof config.data === 'string' && config.data ? JSON.parse(config.data) : (config.data ?? {})

  const respond = (status: number, data: unknown): AxiosResponse => ({ data, status, statusText: String(status), headers: {}, config })

  try {
    for (const [m, re, handler] of routes) {
      if (m !== method) continue
      const match = re.exec(url)
      if (!match) continue
      const ctx: Ctx = { params: match.slice(1), query, body, user: userFromHeader(config) }
      // Structured clone so callers can't mutate mock state through cached results.
      return respond(200, JSON.parse(JSON.stringify(await handler(ctx))))
    }
    throw new HttpError(404, `No mock route for ${method} ${url}`)
  } catch (e) {
    const err = e instanceof HttpError ? e : new HttpError(500, e instanceof Error ? e.message : 'Mock error')
    throw new AxiosError(err.message, String(err.status), config, null, respond(err.status, { message: err.message }))
  }
}
