import { DEFAULT_UNITS, DEFAULT_WINDOWS, PRACTICAL_COLUMNS, THEORY_COLUMNS } from './timetable'
import type {
  AttendanceReport,
  DayLog,
  Half,
  ReportInput,
  StudentReportRow,
  SubjectCounts,
  TimetableSlot,
  TimeWindow,
} from './types'

// ---- small date/time helpers (UTC-only so server timezone never shifts a day) ----

const toUtc = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number)
  return Date.UTC(y, m - 1, d)
}
const fmtUtc = (ms: number) => new Date(ms).toISOString().slice(0, 10)

/** Every YYYY-MM-DD from..to inclusive. */
export function eachDay(from: string, to: string): string[] {
  const out: string[] = []
  for (let t = toUtc(from); t <= toUtc(to); t += 86_400_000) out.push(fmtUtc(t))
  return out
}

/** ISO weekday 1..7 (Mon..Sun). */
export const isoWeekday = (iso: string) => new Date(toUtc(iso)).getUTCDay() || 7

export const round2 = (n: number) => Math.round(n * 100) / 100

/** HH:MM strings compare correctly lexicographically. Missing / out-of-window scans are invalid. */
export function isValidScan(time: string | null | undefined, w: TimeWindow): boolean {
  return !!time && time.slice(0, 5) >= w.from && time.slice(0, 5) <= w.to
}

const halfOf = (slot: TimetableSlot): Half => (slot.start < '13:00' ? 'morning' : 'afternoon')

/** Theory group = theory + mini-project hours; practical group = lab hours. Remedial is not credited. */
function groupOf(slot: TimetableSlot): 'theory' | 'practical' | null {
  if (slot.kind === 'theory' || slot.kind === 'miniproj') return 'theory'
  if (slot.kind === 'practical') return 'practical'
  return null
}

const zeros = (cols: readonly string[]): SubjectCounts => Object.fromEntries(cols.map((c) => [c, 0]))
const sum = (c: SubjectCounts) => Object.values(c).reduce((a, b) => a + b, 0)
const pct = (num: number, den: number) => (den > 0 ? round2((num / den) * 100) : null)

/**
 * Core aggregation: walks every working day in [from, to], credits each scheduled hour to a
 * student when the checkpoint covering that half of the day is valid, and tallies per subject.
 *
 *  - Slot 1 valid  -> all morning hours (start < 13:00) credited
 *  - Slot 2 valid  -> all afternoon hours credited
 *  - Slot 3 missing/invalid after a valid check-in, without permission -> Early Departure flag
 *    (flag only; it does not remove hours)
 */
export function computeAttendanceReport(input: ReportInput): AttendanceReport {
  const { meta, timetable, students, logs } = input
  const windows = input.windows ?? DEFAULT_WINDOWS
  const threshold = input.threshold ?? 75
  const units = { ...DEFAULT_UNITS, ...input.units }
  const cancelled = new Set((input.cancelled ?? []).map((c) => `${c.date}|${c.blockStart}`))
  const holidays = new Set(input.holidays ?? [])

  const workingDays = eachDay(meta.from, meta.to).filter((d) => isoWeekday(d) <= 5 && !holidays.has(d))

  // What was engaged (scheduled) in the period.
  const engagedTheory = zeros(THEORY_COLUMNS)
  const engagedPractical = zeros(PRACTICAL_COLUMNS)
  const sessionsByDay = new Map<string, { slot: TimetableSlot; group: 'theory' | 'practical'; half: Half }[]>()
  for (const day of workingDays) {
    const wd = isoWeekday(day)
    const list = timetable
      .filter((s) => s.weekday === wd)
      .flatMap((slot) => {
        const group = groupOf(slot)
        if (!group || cancelled.has(`${day}|${slot.blockStart}`)) return []
        // A block counted per session contributes once, via its first hour only.
        const unit = slot.kind === 'practical' ? units.practical : slot.kind === 'miniproj' ? units.miniproj : 'hour'
        if (unit === 'session' && slot.start !== slot.blockStart) return []
        return [{ slot, group, half: halfOf(slot) }]
      })
    sessionsByDay.set(day, list)
    for (const { slot, group } of list) {
      const target = group === 'theory' ? engagedTheory : engagedPractical
      target[slot.subject] = (target[slot.subject] ?? 0) + 1
    }
  }
  const theoryEngaged = sum(engagedTheory)
  const practicalEngaged = sum(engagedPractical)

  // Index logs: studentId -> date -> log
  const index = new Map<string, Map<string, DayLog>>()
  for (const l of logs) {
    if (!index.has(l.studentId)) index.set(l.studentId, new Map())
    index.get(l.studentId)!.set(l.date, l)
  }

  const rows: StudentReportRow[] = [...students]
    .sort((a, b) => a.rollNo - b.rollNo)
    .map((s) => {
      const theory = zeros(THEORY_COLUMNS)
      const practical = zeros(PRACTICAL_COLUMNS)
      const earlyDepartures: string[] = []
      const mine = index.get(s.id)

      for (const day of workingDays) {
        const log = mine?.get(day)
        const s1 = isValidScan(log?.slot1, windows.slot1)
        const s2 = isValidScan(log?.slot2, windows.slot2)
        const s3 = isValidScan(log?.slot3, windows.slot3)

        for (const { slot, group, half } of sessionsByDay.get(day) ?? []) {
          if (half === 'morning' ? s1 : s2) {
            const target = group === 'theory' ? theory : practical
            target[slot.subject] = (target[slot.subject] ?? 0) + 1
          }
        }
        if ((s1 || s2) && !s3 && !log?.earlyDeparturePermitted) earlyDepartures.push(day)
      }

      const theoryTotal = sum(theory)
      const practicalTotal = sum(practical)
      const theoryPct = pct(theoryTotal, theoryEngaged)
      const practicalPct = pct(practicalTotal, practicalEngaged)
      return {
        studentId: s.id,
        rollNo: s.rollNo,
        name: s.name,
        guardianPhone: s.guardianPhone,
        theory,
        theoryTotal,
        theoryPct,
        practical,
        practicalTotal,
        practicalPct,
        earlyDepartures,
        isDefaulter: (theoryPct !== null && theoryPct < threshold) || (practicalPct !== null && practicalPct < threshold),
      }
    })

  return {
    meta,
    threshold,
    engaged: {
      theory: engagedTheory,
      theoryTotal: theoryEngaged,
      practical: engagedPractical,
      practicalTotal: practicalEngaged,
      workingDays: workingDays.length,
    },
    rows,
  }
}
