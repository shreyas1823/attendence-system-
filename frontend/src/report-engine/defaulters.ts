import { eachDay, isoWeekday } from './compute'
import type { AttendanceReport, StudentReportRow } from './types'

export const findDefaulters = (report: AttendanceReport): StudentReportRow[] =>
  report.rows.filter((r) => r.isDefaulter)

const fmtPct = (p: number | null) => (p === null ? 'n/a' : `${p.toFixed(2)}%`)
const fmtDate = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number)
  return `${d}/${m}/${y}`
}

export function warningText(row: StudentReportRow, report: AttendanceReport): string {
  const { meta, threshold } = report
  return (
    `Attendance warning: ${row.name} (Roll ${row.rollNo}, ${meta.className} ${meta.semester}, Batch ${meta.batchId}) ` +
    `has Theory attendance ${fmtPct(row.theoryPct)} and Practical attendance ${fmtPct(row.practicalPct)} ` +
    `for ${fmtDate(meta.from)} to ${fmtDate(meta.to)}. The minimum required is ${threshold}%. ` +
    `Please contact the ${meta.department} department.`
  )
}

/** A job destined for the transactional outbox (job_type WHATSAPP_MSG). */
export interface WarningJob {
  jobType: 'WHATSAPP_MSG'
  /** Stable key so a re-run for the same month never double-sends. */
  idempotencyKey: string
  payload: {
    template: 'attendance_warning'
    studentId: string
    to: string
    text: string
    theoryPct: number | null
    practicalPct: number | null
  }
}

export type EnqueueResult = 'queued' | 'duplicate'
export type Enqueue = (job: WarningJob) => Promise<EnqueueResult>

export interface WarningSummary {
  defaulters: number
  queued: number
  duplicates: number
  skippedNoPhone: number
}

const PHONE = /^\+[1-9]\d{8,14}$/

/** Normalises "+91 98765 43210" -> "+919876543210"; returns null if it isn't valid E.164. */
export function normalizePhone(raw: string | undefined): string | null {
  const p = (raw ?? '').replace(/[\s-]/g, '')
  return PHONE.test(p) ? p : null
}

export const monthKey = (iso: string) => iso.slice(0, 7)

export function buildWarningJobs(report: AttendanceReport): { jobs: WarningJob[]; skippedNoPhone: number } {
  const jobs: WarningJob[] = []
  let skippedNoPhone = 0
  for (const row of findDefaulters(report)) {
    const to = normalizePhone(row.guardianPhone)
    if (!to) {
      skippedNoPhone++
      continue
    }
    jobs.push({
      jobType: 'WHATSAPP_MSG',
      idempotencyKey: `defaulter:${report.meta.batchId}:${row.studentId}:${monthKey(report.meta.to)}`,
      payload: {
        template: 'attendance_warning',
        studentId: row.studentId,
        to,
        text: warningText(row, report),
        theoryPct: row.theoryPct,
        practicalPct: row.practicalPct,
      },
    })
  }
  return { jobs, skippedNoPhone }
}

/** Queues one warning per defaulter's guardian. Safe to call repeatedly (idempotent per month). */
export async function queueDefaulterWarnings(report: AttendanceReport, enqueue: Enqueue): Promise<WarningSummary> {
  const { jobs, skippedNoPhone } = buildWarningJobs(report)
  let queued = 0
  let duplicates = 0
  for (const job of jobs) {
    if ((await enqueue(job)) === 'queued') queued++
    else duplicates++
  }
  return { defaulters: findDefaulters(report).length, queued, duplicates, skippedNoPhone }
}

/** True when `date` is the last working day (Mon-Fri, not a holiday) of its month. */
export function isMonthEnd(date: string, holidays: string[] = []): boolean {
  const off = new Set(holidays)
  const month = monthKey(date)
  const [y, m] = date.split('-').map(Number)
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate()
  const days = eachDay(`${month}-01`, `${month}-${String(lastDay).padStart(2, '0')}`)
  const lastWorking = [...days].reverse().find((d) => isoWeekday(d) <= 5 && !off.has(d))
  return lastWorking === date
}

export interface MonthEndDeps {
  today: string
  semesterStart: string
  holidays?: string[]
  /** Builds the report for [from, to]; typically computeAttendanceReport over DB rows. */
  loadReport: (from: string, to: string) => Promise<AttendanceReport>
  enqueue: Enqueue
}

/**
 * Scheduler hook: call once per day (e.g. 17:45 cron). On the last working day of the month it
 * computes semester-to-date attendance (the same cumulative figure shown on the institutional sheet)
 * and queues guardian warnings for everyone under the threshold. Returns null on other days.
 */
export async function runMonthEndDefaulterCheck(deps: MonthEndDeps): Promise<WarningSummary | null> {
  if (!isMonthEnd(deps.today, deps.holidays)) return null
  const report = await deps.loadReport(deps.semesterStart, deps.today)
  return queueDefaulterWarnings(report, deps.enqueue)
}
