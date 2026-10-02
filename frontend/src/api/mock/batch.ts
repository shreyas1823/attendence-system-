/**
 * Synthetic Batch T1 dataset for the institutional attendance sheet (mock API only).
 * Names and roll order follow the department's sheet; every scan and count is generated, not real.
 */
import { computeAttendanceReport, eachDay, isoWeekday } from '@/report-engine/compute'
import { TY_CSE_T1_TIMETABLE } from '@/report-engine/timetable'
import type { AttendanceReport, BatchStudent, CancelledSession, DayLog } from '@/report-engine/types'

export const SEMESTER = { from: '2026-06-29', to: '2026-09-30' }
export const HOLIDAYS = ['2026-07-06', '2026-08-26', '2026-09-14'] // sample holidays

const NAMES = [
  'Badake Mrudula Hanumant', 'Holkar Vaishnavi Balasaheb', 'Gaikwad Aditi Rajesh', 'Waghmare Nikita Nagesh',
  'Kore Pragati Tukaram', 'Pawale Pratiksha Ganesh', 'Bhosale Shweta Shailesh', 'Chavan Mayuri Bhairu',
  'Gaikwad Pruthviraj Pandit', 'Patil Akshay Gulab', 'Bandgar Sushant Bapuso', 'Keche Rohit Ramesh',
  'Kulkarni Vaishnav Mukund', 'Chavan Shreyas Bapurao', 'Kotwal Giridhar Manohar', 'Patil Sanskar Suresh',
  'Pawar Nivedita Sanjay', 'Kare Dhanalakshmi Shrimanth', 'Kazi Anija Zuberpasha', 'Kakade Neha Rajesh',
  'Kawade Dnyaneshwari Navanath', 'Salunkhe Shivanjali Vitthalrao', 'Mulani Yasmin Rafik', 'Survase Sanket Bramhdev',
]

export const batchStudents: BatchStudent[] = NAMES.map((name, i) => ({
  id: `t1-${i + 1}`,
  rollNo: i + 1,
  name,
  guardianPhone: `+91 98000 ${String(10000 + i * 37).slice(0, 5)}`,
}))

// Per-student probability of attending on a given working day.
const pDay = (roll: number) => (roll === 7 ? 0.3 : roll === 12 ? 0.6 : roll === 15 ? 0.72 : 0.93)

function rng(seed: number) {
  let s = seed
  return () => (s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296
}
const hm = (h: number, m: number) => `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`

export const batchLogs: DayLog[] = (() => {
  const rand = rng(2026)
  const out: DayLog[] = []
  for (const s of batchStudents)
    for (const date of eachDay(SEMESTER.from, SEMESTER.to)) {
      if (isoWeekday(date) > 5 || HOLIDAYS.includes(date)) continue
      if (rand() > pDay(s.rollNo)) continue
      out.push({
        studentId: s.id,
        date,
        // ~5% late at the morning scanner (outside the 08:30-09:00 window), ~4% skipped
        slot1: rand() < 0.04 ? null : rand() < 0.05 ? hm(9, 5 + Math.floor(rand() * 20)) : hm(8, 30 + Math.floor(rand() * 30)),
        slot2: rand() < 0.04 ? null : hm(13, 45 + Math.floor(rand() * 30)),
        slot3: rand() < 0.15 ? null : hm(17, Math.floor(rand() * 30)),
      })
    }
  return out
})()

/**
 * Lectures that were scheduled but not conducted. The sheet's "Lect. Engaged" counts conducted
 * lectures only, so these are removed from engaged and attended alike.
 */
export const cancelledSessions: CancelledSession[] = (() => {
  const rand = rng(99)
  const out: CancelledSession[] = []
  const blocks = new Map<string, (typeof TY_CSE_T1_TIMETABLE)[number]>()
  for (const t of TY_CSE_T1_TIMETABLE) if (t.kind !== 'remedial') blocks.set(`${t.weekday}|${t.blockStart}`, t)
  const chance = (b: { subject: string; kind: string }) =>
    b.kind === 'practical' ? 0.23 : b.kind === 'miniproj' ? 0.55 : b.subject === 'CDT' ? 0.45 : 0.12
  for (const date of eachDay(SEMESTER.from, SEMESTER.to)) {
    if (isoWeekday(date) > 5 || HOLIDAYS.includes(date)) continue
    for (const b of blocks.values()) if (b.weekday === isoWeekday(date) && rand() < chance(b)) out.push({ date, blockStart: b.blockStart })
  }
  return out
})()

export function sheetReport(from: string, to: string, threshold = 75): AttendanceReport {
  return computeAttendanceReport({
    meta: { department: 'Computer Science & Engineering', className: 'T.Y. B.Tech', semester: 'Sem-I', academicYear: '2026-27', batchId: 'T1', from, to },
    timetable: TY_CSE_T1_TIMETABLE,
    students: batchStudents,
    logs: batchLogs,
    holidays: HOLIDAYS,
    cancelled: cancelledSessions,
    threshold,
  })
}

/** Idempotency keys already queued (stand-in for a unique index on outbox_jobs.idempotency_key). */
export const queuedWarningKeys = new Set<string>()
