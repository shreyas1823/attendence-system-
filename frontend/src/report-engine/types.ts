/**
 * Report engine types. Everything under src/report-engine is framework-free (no React, no DOM)
 * so the same code can run inside the Fastify backend or a worker.
 */

export type SessionKind = 'theory' | 'practical' | 'miniproj' | 'remedial'
export type Weekday = 1 | 2 | 3 | 4 | 5 // ISO: Mon..Fri
export type Half = 'morning' | 'afternoon'

/** One credited teaching hour. A 2-hour lab is two consecutive slots. */
export interface TimetableSlot {
  weekday: Weekday
  start: string // HH:MM
  end: string // HH:MM
  subject: string // column key, e.g. "OS", "Mini-proj"
  kind: SessionKind
  /** Start of the contiguous block this hour belongs to (a 2h lab = two slots sharing blockStart). */
  blockStart: string
}

export type CreditUnit = 'hour' | 'session'

/** How a multi-hour block counts toward "Lect. Engaged" and attended totals. */
export interface CreditUnits {
  practical: CreditUnit // reference sheet counts one 2-hour lab as 1
  miniproj: CreditUnit
}

/** A lecture/lab that was scheduled but not conducted: removed from engaged AND from attended. */
export interface CancelledSession {
  date: string // YYYY-MM-DD
  blockStart: string // HH:MM start of the block (see TimetableSlot.blockStart)
}

export interface TimeWindow {
  from: string // HH:MM inclusive
  to: string // HH:MM inclusive
}

export interface SlotWindows {
  slot1: TimeWindow // morning check-in
  slot2: TimeWindow // post-lunch check-in
  slot3: TimeWindow // campus exit
}

/** Raw biometric day record: three checkpoint scans (HH:MM or null when missing). */
export interface DayLog {
  studentId: string
  date: string // YYYY-MM-DD
  slot1: string | null
  slot2: string | null
  slot3: string | null
  /** Approved early leave: suppresses the Early Departure flag. */
  earlyDeparturePermitted?: boolean
}

export interface BatchStudent {
  id: string
  rollNo: number
  name: string
  guardianPhone?: string
}

export interface ReportMeta {
  department: string
  className: string // "T.Y. B.Tech"
  semester: string // "Sem-I"
  academicYear: string // "2026-27"
  batchId: string // "T1"
  from: string
  to: string
}

export interface ReportInput {
  meta: ReportMeta
  timetable: TimetableSlot[]
  students: BatchStudent[]
  logs: DayLog[]
  holidays?: string[]
  windows?: SlotWindows
  units?: Partial<CreditUnits>
  cancelled?: CancelledSession[]
  /** Defaulter threshold in percent (default 75). */
  threshold?: number
}

export type SubjectCounts = Record<string, number>

export interface Engaged {
  theory: SubjectCounts
  theoryTotal: number
  practical: SubjectCounts
  practicalTotal: number
  workingDays: number
}

export interface StudentReportRow {
  studentId: string
  rollNo: number
  name: string
  guardianPhone?: string
  theory: SubjectCounts
  theoryTotal: number
  theoryPct: number | null // null when no lectures were engaged
  practical: SubjectCounts
  practicalTotal: number
  practicalPct: number | null
  /** Dates with a valid check-in but no valid exit scan and no permission. */
  earlyDepartures: string[]
  isDefaulter: boolean
}

export interface AttendanceReport {
  meta: ReportMeta
  threshold: number
  engaged: Engaged
  rows: StudentReportRow[]
}
