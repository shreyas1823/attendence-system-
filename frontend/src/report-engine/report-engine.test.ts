import { describe, expect, it, vi } from 'vitest'
import { computeAttendanceReport, eachDay, isValidScan, round2 } from './compute'
import { buildWarningJobs, isMonthEnd, normalizePhone, queueDefaulterWarnings, runMonthEndDefaulterCheck } from './defaulters'
import { FIXTURE_LOGS, FIXTURE_META, FIXTURE_STUDENTS } from './fixture'
import { buildSheetLayout, COL_COUNT, placeCells } from './layout'
import { REF_ENGAGED, REF_ROWS } from './reference-sheet'
import { DEFAULT_WINDOWS, PRACTICAL_COLUMNS, THEORY_COLUMNS, TY_CSE_T1_TIMETABLE } from './timetable'
import type { AttendanceReport } from './types'

const run = (over = {}) =>
  computeAttendanceReport({ meta: FIXTURE_META, timetable: TY_CSE_T1_TIMETABLE, students: FIXTURE_STUDENTS, logs: FIXTURE_LOGS, ...over })

describe('scan windows', () => {
  it('accepts boundaries and rejects outside / missing', () => {
    expect(isValidScan('08:30', DEFAULT_WINDOWS.slot1)).toBe(true)
    expect(isValidScan('09:00', DEFAULT_WINDOWS.slot1)).toBe(true)
    expect(isValidScan('09:01', DEFAULT_WINDOWS.slot1)).toBe(false)
    expect(isValidScan(null, DEFAULT_WINDOWS.slot1)).toBe(false)
    expect(isValidScan('14:00:30', DEFAULT_WINDOWS.slot2)).toBe(true)
  })
})

describe('computeAttendanceReport', () => {
  const report = run()
  const [a, b, c] = report.rows

  it('counts engaged lectures from the weekly timetable (practical per lab session)', () => {
    expect(report.engaged.theoryTotal).toBe(24) // 21 theory + 3 mini-proj hours
    expect(report.engaged.practicalTotal).toBe(5) // one per 2-hour lab session
    expect(report.engaged.theory).toMatchObject({ OS: 4, STQA: 4, MDM: 4, DBE: 4, DAA: 4, CDT: 1, 'Mini-proj': 3 })
    expect(report.engaged.practical).toEqual({ DBE: 1, OS: 1, CDT: 1, STQA: 1, MDM: 1 })
  })

  it('can count practical per hour instead of per session', () => {
    const r = run({ units: { practical: 'hour' } })
    expect(r.engaged.practicalTotal).toBe(10)
    expect(r.rows[2].practicalTotal).toBe(6)
  })

  it('counts mini-project per session when asked', () => {
    expect(run({ units: { miniproj: 'session' } }).engaged.theory['Mini-proj']).toBe(2) // Wed block + Fri block
  })

  it('removes cancelled lectures from engaged and from attended', () => {
    // Tue 2026-09-08: the 14:00 DAA lecture and the 09:00 STQA lab were not conducted
    const r = run({ cancelled: [{ date: '2026-09-08', blockStart: '14:00' }, { date: '2026-09-08', blockStart: '09:00' }] })
    expect(r.engaged.theory.DAA).toBe(3)
    expect(r.engaged.practical.STQA).toBe(0)
    expect(r.engaged.theoryTotal).toBe(23)
    expect(r.engaged.practicalTotal).toBe(4)
    expect(r.rows[0].theoryTotal).toBe(23) // A loses the cancelled DAA hour too
    expect(r.rows[0].practicalTotal).toBe(4)
    expect(r.rows[1].theoryTotal).toBe(21) // B had already missed Tuesday afternoon
  })

  it('credits a student with every valid scan', () => {
    expect([a.theoryTotal, a.practicalTotal, a.theoryPct, a.practicalPct]).toEqual([24, 5, 100, 100])
    expect(a.isDefaulter).toBe(false)
  })

  it('drops afternoon hours when slot 2 is missing and flags missing slot 3 as early departure', () => {
    expect(b.theoryTotal).toBe(21)
    expect(b.theoryPct).toBe(87.5)
    expect(b.practicalTotal).toBe(5)
    expect(b.earlyDepartures).toEqual(['2026-09-11'])
  })

  it('drops morning hours when slot 1 is missing or late, and flags defaulters', () => {
    expect(c.theoryTotal).toBe(20)
    expect(c.practicalTotal).toBe(3)
    expect(c.practical).toEqual({ DBE: 0, OS: 0, CDT: 1, STQA: 1, MDM: 1 })
    expect(c.theoryPct).toBe(83.33)
    expect(c.practicalPct).toBe(60)
    expect(c.isDefaulter).toBe(true)
    expect(c.earlyDepartures).toEqual([])
  })

  it('does not flag early departure when permission was granted', () => {
    const logs = FIXTURE_LOGS.map((l) => (l.studentId === 'B' && l.date === '2026-09-11' ? { ...l, earlyDeparturePermitted: true } : l))
    expect(run({ logs }).rows[1].earlyDepartures).toEqual([])
  })

  it('skips holidays and weekends in both engaged and attended', () => {
    const r = run({ holidays: ['2026-09-08'], meta: { ...FIXTURE_META, to: '2026-09-13' } })
    expect(r.engaged.workingDays).toBe(4)
    expect(r.engaged.theoryTotal).toBe(24 - 5) // Tuesday had 5 theory hours
    expect(r.rows[0].theoryPct).toBe(100)
  })

  it('treats students with no logs as fully absent', () => {
    const r = run({ students: [...FIXTURE_STUDENTS, { id: 'Z', rollNo: 9, name: 'Z' }] })
    expect(r.rows[3]).toMatchObject({ theoryTotal: 0, practicalTotal: 0, theoryPct: 0, isDefaulter: true })
  })

  it('returns null percentages when nothing was engaged', () => {
    const r = run({ meta: { ...FIXTURE_META, from: '2026-09-12', to: '2026-09-13' } })
    expect(r.rows[0].theoryPct).toBeNull()
    expect(r.rows[0].isDefaulter).toBe(false)
  })

  it('eachDay is inclusive and timezone independent', () => {
    expect(eachDay('2026-02-27', '2026-03-02')).toEqual(['2026-02-27', '2026-02-28', '2026-03-01', '2026-03-02'])
  })
})

describe('sheet layout', () => {
  const layout = buildSheetLayout(run())

  it('has the boxed institutional title lines', () => {
    const t = layout.rows.filter((r) => r.section === 'title').map((r) => r.cells[0].text)
    expect(t).toEqual(['Computer Science & Engineering', 'T.Y. B.Tech  Sem-I   (2026-27)', 'Attendance (7/9/2026 to 11/9/2026)'])
  })

  it('puts T1 / SEM-I in the group-header row and merges ATTD. % across both header rows', () => {
    const [h1, h2] = layout.rows.filter((r) => r.section === 'head')
    expect(h1.cells.slice(0, 4).map((c) => [c.text, c.colSpan ?? 1, c.rowSpan ?? 1])).toEqual([
      ['T1', 1, 1],
      ['SEM-I', 1, 1],
      ['Theory', 8, 1],
      ['ATTD. %', 1, 2],
    ])
    expect(h1.cells.slice(4).map((c) => [c.text, c.colSpan ?? 1, c.rowSpan ?? 1])).toEqual([
      ['Practical / Tutorial', 6, 1],
      ['% ATTD.', 1, 2],
    ])
    expect(h2.cells.map((c) => c.text)).toEqual(['Roll No', 'Name of the Student', ...THEORY_COLUMNS, 'TOTAL', ...PRACTICAL_COLUMNS, 'TOTAL'])
  })

  it('every row fills exactly the column count once spans are applied', () => {
    const placed = placeCells(layout)
    const perRow = new Map<number, number>()
    for (const p of placed) for (let r = p.row; r < p.row + p.rowSpan; r++) perRow.set(r, (perRow.get(r) ?? 0) + p.colSpan)
    expect([...perRow.values()].every((n) => n === COL_COUNT)).toBe(true)
  })

  it('shows the red benchmark row, red totals, upper-case names and threshold colours', () => {
    const eng = layout.rows.find((r) => r.section === 'engaged')!
    expect(eng.cells[1].text).toBe('Lect. Engaged')
    expect(eng.cells.filter((c) => c.text !== '').every((c) => c.tone === 'red')).toBe(true)
    const body = layout.rows.filter((r) => r.section === 'body')
    expect(body[0].cells[1].text).toBe('STUDENT A')
    expect(body[0].cells[9].tone).toBe('red') // theory TOTAL
    expect(body[0].cells[10].tone).toBe('ok') // theory %
    expect(body[2].warn).toBe(true)
    expect(body[2].cells[17].tone).toBe('danger')
    expect(body[2].cells[17].text).toBe('60.00')
  })
})

describe('golden: reference sheet figures', () => {
  it('printed percentages equal total / engaged * 100 rounded to 2 dp', () => {
    expect(REF_ENGAGED.theory.reduce((x, y) => x + y, 0)).toBe(REF_ENGAGED.theoryTotal)
    expect(REF_ENGAGED.practical.reduce((x, y) => x + y, 0)).toBe(REF_ENGAGED.practicalTotal)
    for (const row of REF_ROWS) {
      expect(row.theory.reduce((x, y) => x + y, 0), `roll ${row.roll} theory total`).toBe(row.theoryTotal)
      expect(row.practical.reduce((x, y) => x + y, 0), `roll ${row.roll} practical total`).toBe(row.practicalTotal)
      expect(round2((row.theoryTotal / REF_ENGAGED.theoryTotal) * 100).toFixed(2), `roll ${row.roll} theory %`).toBe(row.theoryPct)
      expect(round2((row.practicalTotal / REF_ENGAGED.practicalTotal) * 100).toFixed(2), `roll ${row.roll} practical %`).toBe(row.practicalPct)
    }
  })

  it('renders the reference rows exactly as printed', () => {
    const report: AttendanceReport = {
      meta: { ...FIXTURE_META, from: '2026-06-29', to: '2026-09-30' },
      threshold: 75,
      engaged: {
        theory: Object.fromEntries(THEORY_COLUMNS.map((c, i) => [c, REF_ENGAGED.theory[i]])),
        theoryTotal: REF_ENGAGED.theoryTotal,
        practical: Object.fromEntries(PRACTICAL_COLUMNS.map((c, i) => [c, REF_ENGAGED.practical[i]])),
        practicalTotal: REF_ENGAGED.practicalTotal,
        workingDays: 0,
      },
      rows: REF_ROWS.map((r) => ({
        studentId: `r${r.roll}`,
        rollNo: r.roll,
        name: `Student ${r.roll}`,
        theory: Object.fromEntries(THEORY_COLUMNS.map((c, i) => [c, r.theory[i]])),
        theoryTotal: r.theoryTotal,
        theoryPct: round2((r.theoryTotal / 260) * 100),
        practical: Object.fromEntries(PRACTICAL_COLUMNS.map((c, i) => [c, r.practical[i]])),
        practicalTotal: r.practicalTotal,
        practicalPct: round2((r.practicalTotal / 50) * 100),
        earlyDepartures: [],
        isDefaulter: r.theoryTotal / 260 < 0.75 || r.practicalTotal / 50 < 0.75,
      })),
    }
    const layout = buildSheetLayout(report)
    expect(layout.rows.filter((r) => r.section === 'title')[2].cells[0].text).toBe('Attendance (29/6/2026 to 30/9/2026)')
    expect(layout.rows.find((r) => r.section === 'engaged')!.cells.map((c) => c.text)).toEqual([
      '', 'Lect. Engaged', '16', '50', '46', '7', '54', '44', '43', '260', '', '12', '8', '10', '11', '9', '50', '',
    ])
    const body = layout.rows.filter((r) => r.section === 'body')
    expect(body[6].cells.map((c) => c.text)).toEqual(['7', 'STUDENT 7', '5', '16', '13', '5', '16', '11', '10', '76', '29.23', '1', '3', '3', '6', '3', '16', '32.00'])
    expect(body[6].warn).toBe(true)
    // Rule from the brief (< 75%): rolls 7, 13, 16, 20 are flagged; the sample sheet only shaded roll 7.
    expect(body.filter((x) => x.warn).map((x) => x.cells[0].text)).toEqual(['7', '13', '16', '20'])
  })
})

describe('defaulter warnings', () => {
  const report = run()

  it('normalises phone numbers', () => {
    expect(normalizePhone('+91 98000-00003')).toBe('+919800000003')
    expect(normalizePhone('9800000003')).toBeNull()
    expect(normalizePhone(undefined)).toBeNull()
  })

  it('builds one idempotent job per defaulter with a phone', () => {
    const { jobs } = buildWarningJobs(report)
    expect(jobs).toHaveLength(1)
    expect(jobs[0].idempotencyKey).toBe('defaulter:T1:C:2026-09')
    expect(jobs[0].payload.to).toBe('+919800000003')
    expect(jobs[0].payload.text).toContain('Practical attendance 60.00%')
  })

  it('counts queued, duplicate and phone-less defaulters', async () => {
    const seen = new Set<string>()
    const enqueue = vi.fn(async (j: { idempotencyKey: string }) => (seen.has(j.idempotencyKey) ? 'duplicate' : (seen.add(j.idempotencyKey), 'queued')) as 'queued' | 'duplicate')
    expect(await queueDefaulterWarnings(report, enqueue)).toEqual({ defaulters: 1, queued: 1, duplicates: 0, skippedNoPhone: 0 })
    expect((await queueDefaulterWarnings(report, enqueue)).duplicates).toBe(1)

    const noPhone = run({ students: FIXTURE_STUDENTS.map((s) => ({ ...s, guardianPhone: undefined })) })
    expect((await queueDefaulterWarnings(noPhone, enqueue)).skippedNoPhone).toBe(1)
  })

  it('detects the last working day of a month', () => {
    expect(isMonthEnd('2026-09-30')).toBe(true) // Wednesday
    expect(isMonthEnd('2026-09-29')).toBe(false)
    expect(isMonthEnd('2026-07-31')).toBe(true) // Friday
    expect(isMonthEnd('2026-08-31')).toBe(true) // Monday (Aug 29-30 are Sat/Sun)
    expect(isMonthEnd('2026-09-30', ['2026-09-30'])).toBe(false)
    expect(isMonthEnd('2026-09-29', ['2026-09-30'])).toBe(true)
  })

  it('month-end runner only fires on the last working day and loads semester-to-date', async () => {
    const loadReport = vi.fn(async () => report)
    const enqueue = vi.fn(async () => 'queued' as const)
    expect(await runMonthEndDefaulterCheck({ today: '2026-09-15', semesterStart: '2026-06-29', loadReport, enqueue })).toBeNull()
    expect(loadReport).not.toHaveBeenCalled()
    const res = await runMonthEndDefaulterCheck({ today: '2026-09-30', semesterStart: '2026-06-29', loadReport, enqueue })
    expect(loadReport).toHaveBeenCalledWith('2026-06-29', '2026-09-30')
    expect(res?.queued).toBe(1)
  })
})
