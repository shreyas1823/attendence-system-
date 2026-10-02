/**
 * Hand-verifiable fixture shared by the TypeScript tests and the SQL function test, so both
 * implementations are checked against the same expected numbers. Week of Mon 2026-09-07.
 *
 * Weekly engaged: theory 21 + mini-proj 3 = 24, practical 10.
 *  A: perfect                       -> 24 / 10
 *  B: misses slot 2 on Tuesday      -> loses DAA, OS, STQA (3)  => theory 21; no slot 3 on Friday -> early departure
 *  C: no slot 1 Wed, late slot 1 Thu (09:10 is outside 08:30-09:00)
 *                                    -> theory 24-2-2 = 20, practical 10-2-2 = 6 (defaulter)
 */
import type { BatchStudent, DayLog, ReportMeta } from './types'

export const FIXTURE_META: ReportMeta = {
  department: 'Computer Science & Engineering',
  className: 'T.Y. B.Tech',
  semester: 'Sem-I',
  academicYear: '2026-27',
  batchId: 'T1',
  from: '2026-09-07',
  to: '2026-09-11',
}

export const FIXTURE_STUDENTS: BatchStudent[] = [
  { id: 'A', rollNo: 1, name: 'Student A', guardianPhone: '+91 98000 00001' },
  { id: 'B', rollNo: 2, name: 'Student B', guardianPhone: '+91 98000 00002' },
  { id: 'C', rollNo: 3, name: 'Student C', guardianPhone: '+91 98000 00003' },
]

const DAYS = ['2026-09-07', '2026-09-08', '2026-09-09', '2026-09-10', '2026-09-11']
const ok = (studentId: string, date: string): DayLog => ({ studentId, date, slot1: '08:45', slot2: '14:00', slot3: '17:10' })

export const FIXTURE_LOGS: DayLog[] = [
  ...DAYS.map((d) => ok('A', d)),
  ...DAYS.map((d) => {
    const l = ok('B', d)
    if (d === '2026-09-08') l.slot2 = null
    if (d === '2026-09-11') l.slot3 = null
    return l
  }),
  ...DAYS.map((d) => {
    const l = ok('C', d)
    if (d === '2026-09-09') l.slot1 = null
    if (d === '2026-09-10') l.slot1 = '09:10'
    return l
  }),
]
