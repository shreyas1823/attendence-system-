// @vitest-environment node
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { PGlite } from '@electric-sql/pglite'
import { beforeAll, describe, expect, it } from 'vitest'
import { computeAttendanceReport, eachDay } from './compute'
import { FIXTURE_LOGS, FIXTURE_META, FIXTURE_STUDENTS } from './fixture'
import { TY_CSE_T1_TIMETABLE } from './timetable'
import type { BatchStudent, CancelledSession, CreditUnits, DayLog, ReportMeta } from './types'

const sql = readFileSync(path.resolve(__dirname, '../../../backend/sql/attendance_summary.sql'), 'utf8')
let db: PGlite

const numId = (id: string) => Number(id.replace(/\D/g, '') || 0)

async function load(students: BatchStudent[], logs: DayLog[], holidays: string[], cancelled: CancelledSession[]) {
  await db.exec('truncate students, biometric_day_logs, academic_holidays, timetable_slots, cancelled_sessions restart identity')
  for (const t of TY_CSE_T1_TIMETABLE)
    await db.query('insert into timetable_slots (batch_id, weekday, start_time, end_time, block_start, subject, kind) values ($1,$2,$3,$4,$5,$6,$7)', [
      'T1', t.weekday, t.start, t.end, t.blockStart, t.subject, t.kind,
    ])
  for (const s of students) await db.query('insert into students values ($1,$2,$3,$4,$5)', [numId(s.id), s.rollNo, s.name, 'T1', s.guardianPhone ?? null])
  for (const l of logs)
    await db.query('insert into biometric_day_logs values ($1,$2,$3,$4,$5,$6)', [numId(l.studentId), l.date, l.slot1, l.slot2, l.slot3, !!l.earlyDeparturePermitted])
  for (const h of holidays) await db.query('insert into academic_holidays (holiday_date) values ($1)', [h])
  for (const c of cancelled) await db.query('insert into cancelled_sessions values ($1,$2,$3)', ['T1', c.date, c.blockStart])
}

async function compare(
  meta: ReportMeta,
  students: BatchStudent[],
  logs: DayLog[],
  opts: { holidays?: string[]; cancelled?: CancelledSession[]; units?: Partial<CreditUnits> } = {},
) {
  const holidays = opts.holidays ?? []
  const cancelled = opts.cancelled ?? []
  await load(students, logs, holidays, cancelled)
  const ts = computeAttendanceReport({ meta, timetable: TY_CSE_T1_TIMETABLE, students, logs, holidays, cancelled, units: opts.units })
  const pu = opts.units?.practical ?? 'session'
  const mu = opts.units?.miniproj ?? 'hour'

  const { rows } = await db.query<{ roll_no: number; grp: string; subject: string; attended: number; engaged: number }>(
    'select roll_no, grp, subject, attended, engaged from attendance_summary($1,$2,$3,$4,$5)',
    ['T1', meta.from, meta.to, pu, mu],
  )
  for (const r of rows) {
    const row = ts.rows.find((x) => x.rollNo === r.roll_no)!
    const attended = r.grp === 'theory' ? row.theory[r.subject] : row.practical[r.subject]
    const engaged = r.grp === 'theory' ? ts.engaged.theory[r.subject] : ts.engaged.practical[r.subject]
    expect({ roll: r.roll_no, grp: r.grp, subject: r.subject, attended: r.attended, engaged: r.engaged }).toEqual({
      roll: r.roll_no, grp: r.grp, subject: r.subject, attended, engaged,
    })
  }
  const early = await db.query<{ student_id: number; log_date: Date | string }>('select student_id, log_date from attendance_early_departures($1,$2,$3)', ['T1', meta.from, meta.to])
  const sqlEarly = early.rows.map((e) => `${e.student_id}:${new Date(e.log_date).toISOString().slice(0, 10)}`).sort()
  const tsEarly = ts.rows.flatMap((r) => r.earlyDepartures.map((d) => `${numId(r.studentId)}:${d}`)).sort()
  expect(sqlEarly).toEqual(tsEarly)
  return { rows, ts }
}

describe('attendance_summary() SQL matches the TypeScript engine', () => {
  beforeAll(async () => {
    db = new PGlite()
    await db.exec('create table students (id bigint primary key, roll_no int, name text, batch_id text, guardian_phone text)')
    await db.exec(sql)
  })

  const fixture = () => {
    const remap = (id: string) => `S${'ABC'.indexOf(id) + 1}`
    return {
      students: FIXTURE_STUDENTS.map((s) => ({ ...s, id: remap(s.id) })),
      logs: FIXTURE_LOGS.map((l) => ({ ...l, studentId: remap(l.studentId) })),
    }
  }
  const total = (rows: { roll_no: number; grp: string; attended: number; engaged: number }[], roll: number, grp: string, f: 'attended' | 'engaged') =>
    rows.filter((r) => r.roll_no === roll && r.grp === grp).reduce((a, r) => a + r[f], 0)

  it('fixture week, practical per session: hand-verified totals', async () => {
    const { students, logs } = fixture()
    const { rows } = await compare(FIXTURE_META, students, logs)
    expect([total(rows, 1, 'theory', 'attended'), total(rows, 1, 'practical', 'attended')]).toEqual([24, 5])
    expect([total(rows, 2, 'theory', 'attended'), total(rows, 2, 'practical', 'attended')]).toEqual([21, 5])
    expect([total(rows, 3, 'theory', 'attended'), total(rows, 3, 'practical', 'attended')]).toEqual([20, 3])
    expect([total(rows, 1, 'theory', 'engaged'), total(rows, 1, 'practical', 'engaged')]).toEqual([24, 5])
  })

  it('fixture week, practical per hour', async () => {
    const { students, logs } = fixture()
    const { rows } = await compare(FIXTURE_META, students, logs, { units: { practical: 'hour' } })
    expect([total(rows, 3, 'practical', 'attended'), total(rows, 3, 'practical', 'engaged')]).toEqual([6, 10])
  })

  it('cancelled lectures leave engaged and attended', async () => {
    const { students, logs } = fixture()
    const cancelled = [{ date: '2026-09-08', blockStart: '14:00' }, { date: '2026-09-08', blockStart: '09:00' }]
    const { rows } = await compare(FIXTURE_META, students, logs, { cancelled })
    expect([total(rows, 1, 'theory', 'engaged'), total(rows, 1, 'practical', 'engaged')]).toEqual([23, 4])
  })

  for (const units of [{}, { practical: 'hour' as const, miniproj: 'session' as const }]) {
    it(`6 weeks of randomised logs with holidays, late scans, permissions and cancellations (${JSON.stringify(units)})`, async () => {
      let seed = 7
      const rnd = () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296)
      const students: BatchStudent[] = Array.from({ length: 12 }, (_, i) => ({ id: `S${i + 1}`, rollNo: i + 1, name: `S${i + 1}` }))
      const meta: ReportMeta = { ...FIXTURE_META, from: '2026-08-03', to: '2026-09-13' }
      const holidays = ['2026-08-14', '2026-09-02']
      const t = (h: number, lo: number, hi: number) => {
        const m = Math.round(lo + rnd() * (hi - lo))
        return `${String(h + Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
      }
      const logs: DayLog[] = []
      for (const s of students)
        for (const d of eachDay(meta.from, meta.to)) {
          if (rnd() < 0.15) continue // no record at all
          logs.push({
            studentId: s.id,
            date: d,
            slot1: rnd() < 0.1 ? null : t(8, 25, 70), // 08:25..09:10 -> some outside the window
            slot2: rnd() < 0.1 ? null : t(13, 40, 80),
            slot3: rnd() < 0.15 ? null : t(16, 55, 95),
            earlyDeparturePermitted: rnd() < 0.1,
          })
        }
      const blocks = [...new Set(TY_CSE_T1_TIMETABLE.filter((x) => x.kind !== 'remedial').map((x) => `${x.weekday}|${x.blockStart}`))]
      const cancelled: CancelledSession[] = []
      for (const d of eachDay(meta.from, meta.to)) {
        const wd = new Date(`${d}T00:00:00Z`).getUTCDay() || 7
        for (const b of blocks) {
          const [bw, start] = b.split('|')
          if (Number(bw) === wd && rnd() < 0.12) cancelled.push({ date: d, blockStart: start })
        }
      }
      await compare(meta, students, logs, { holidays, cancelled, units })
    })
  }
})
