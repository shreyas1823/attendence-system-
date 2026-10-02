import { PRACTICAL_COLUMNS, THEORY_COLUMNS } from './timetable'
import type { AttendanceReport } from './types'

/**
 * One description of the institutional sheet, consumed by the React table, the Excel exporter
 * and the PDF exporter so all three always have the same structure, merges and values.
 */
export type Tone = 'title' | 'head' | 'red' | 'normal' | 'ok' | 'danger' | 'muted'

export interface SheetCell {
  text: string
  colSpan?: number
  rowSpan?: number
  align: 'left' | 'center' | 'right'
  bold?: boolean
  tone: Tone
}

export interface SheetRow {
  section: 'title' | 'head' | 'engaged' | 'body'
  cells: SheetCell[]
  /** Defaulter row: whole row is tinted. */
  warn?: boolean
}

export interface SheetLayout {
  colCount: number
  rows: SheetRow[]
  /** Relative column widths (Excel "characters"). */
  colWidths: number[]
}

export const COL_COUNT = 2 + THEORY_COLUMNS.length + 2 + PRACTICAL_COLUMNS.length + 2 // 18

const dmy = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number)
  return `${d}/${m}/${y}`
}
const fmtPct = (p: number | null) => (p === null ? '–' : p.toFixed(2))

const cell = (text: string | number, tone: Tone = 'normal', extra: Partial<SheetCell> = {}): SheetCell => ({
  text: String(text),
  align: 'center',
  tone,
  ...extra,
})

/**
 * Mirrors the institutional sheet:
 *   rows 1-3  boxed title lines
 *   row 4     "T1 | SEM-I" | Theory (over subjects + TOTAL) | ATTD. % (tall) | Practical / Tutorial | % ATTD. (tall)
 *   row 5     Roll No | Name | subject columns | TOTAL ...
 *   row 6     Lect. Engaged (red)
 *   row 7+    students
 */
export function buildSheetLayout(report: AttendanceReport): SheetLayout {
  const { meta, engaged, threshold } = report
  const rows: SheetRow[] = []

  const title = (text: string): SheetRow => ({
    section: 'title',
    cells: [cell(text, 'title', { colSpan: COL_COUNT, bold: true })],
  })
  rows.push(title(meta.department))
  rows.push(title(`${meta.className}  ${meta.semester}   (${meta.academicYear})`))
  rows.push(title(`Attendance (${dmy(meta.from)} to ${dmy(meta.to)})`))

  const T = THEORY_COLUMNS.length
  const P = PRACTICAL_COLUMNS.length
  rows.push({
    section: 'head',
    cells: [
      cell(meta.batchId, 'red', { bold: true, align: 'left' }),
      cell(meta.semester.toUpperCase(), 'red', { bold: true, align: 'left' }),
      cell('Theory', 'red', { colSpan: T + 1, bold: true }),
      cell('ATTD. %', 'red', { rowSpan: 2, bold: true }),
      cell('Practical / Tutorial', 'red', { colSpan: P + 1, bold: true }),
      cell('% ATTD.', 'red', { rowSpan: 2, bold: true }),
    ],
  })
  rows.push({
    section: 'head',
    cells: [
      cell('Roll No', 'red', { bold: true }),
      cell('Name of the Student', 'red', { bold: true, align: 'left' }),
      ...THEORY_COLUMNS.map((c) => cell(c, 'head', { bold: true })),
      cell('TOTAL', 'red', { bold: true }),
      ...PRACTICAL_COLUMNS.map((c) => cell(c, 'head', { bold: true })),
      cell('TOTAL', 'red', { bold: true }),
    ],
  })

  rows.push({
    section: 'engaged',
    cells: [
      cell('', 'red'),
      cell('Lect. Engaged', 'red', { bold: true, align: 'left' }),
      ...THEORY_COLUMNS.map((c) => cell(engaged.theory[c] ?? 0, 'red', { bold: true })),
      cell(engaged.theoryTotal, 'red', { bold: true }),
      cell('', 'red'),
      ...PRACTICAL_COLUMNS.map((c) => cell(engaged.practical[c] ?? 0, 'red', { bold: true })),
      cell(engaged.practicalTotal, 'red', { bold: true }),
      cell('', 'red'),
    ],
  })

  const pctCell = (p: number | null) =>
    cell(fmtPct(p), p === null ? 'muted' : p < threshold ? 'danger' : 'ok', { bold: true })

  for (const r of report.rows) {
    rows.push({
      section: 'body',
      warn: r.isDefaulter,
      cells: [
        cell(r.rollNo),
        cell(r.name.toUpperCase(), 'normal', { align: 'left' }),
        ...THEORY_COLUMNS.map((c) => cell(r.theory[c] ?? 0)),
        cell(r.theoryTotal, 'red', { bold: true }),
        pctCell(r.theoryPct),
        ...PRACTICAL_COLUMNS.map((c) => cell(r.practical[c] ?? 0)),
        cell(r.practicalTotal, 'red', { bold: true }),
        pctCell(r.practicalPct),
      ],
    })
  }

  return {
    colCount: COL_COUNT,
    rows,
    colWidths: [8, 34, ...THEORY_COLUMNS.map(() => 8), 8, 10, ...PRACTICAL_COLUMNS.map(() => 6), 8, 10],
  }
}

export interface PlacedCell {
  row: number // 0-based
  col: number // 0-based
  rowSpan: number
  colSpan: number
  cell: SheetCell
  section: SheetRow['section']
  warn: boolean
}

/** Resolves colSpan/rowSpan into absolute grid coordinates (needed for Excel merges). */
export function placeCells(layout: SheetLayout): PlacedCell[] {
  const taken = new Set<string>()
  const out: PlacedCell[] = []
  layout.rows.forEach((row, r) => {
    let c = 0
    for (const cellDef of row.cells) {
      while (taken.has(`${r},${c}`)) c++
      const rowSpan = cellDef.rowSpan ?? 1
      const colSpan = cellDef.colSpan ?? 1
      for (let dr = 0; dr < rowSpan; dr++) for (let dc = 0; dc < colSpan; dc++) taken.add(`${r + dr},${c + dc}`)
      out.push({ row: r, col: c, rowSpan, colSpan, cell: cellDef, section: row.section, warn: !!row.warn })
      c += colSpan
    }
  })
  return out
}
