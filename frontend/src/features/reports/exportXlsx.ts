import { placeCells, type SheetLayout, type Tone } from '@/report-engine/layout'
import { downloadBlob } from '@/lib/format'

const ARGB = {
  warnFill: 'FFFBD5B5',
  brand: 'FFC00000', // the sheet's red for headers, totals and the Lect. Engaged row
  danger: 'FFB91C1C',
  green: 'FF166534',
  grey: 'FF6B7280',
}

const textColor = (tone: Tone) =>
  tone === 'red' ? ARGB.brand : tone === 'danger' ? ARGB.danger : tone === 'ok' ? ARGB.green : tone === 'muted' ? ARGB.grey : 'FF000000'

/** Writes the institutional sheet to .xlsx with the same merges as the on-screen table. */
export async function exportReportXlsx(layout: SheetLayout, filename: string) {
  const ExcelJS = (await import('exceljs')).default
  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet('Attendance', {
    pageSetup: { orientation: 'landscape', paperSize: 9, fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
  })
  layout.colWidths.forEach((w, i) => (ws.getColumn(i + 1).width = w))

  const thin = { style: 'thin' as const, color: { argb: 'FF000000' } }
  const dbl = { style: 'double' as const, color: { argb: 'FF000000' } }
  const lastHeadRow = layout.rows.map((r) => r.section).lastIndexOf('head')

  for (const p of placeCells(layout)) {
    const { cell, section } = p
    const master = ws.getCell(p.row + 1, p.col + 1)
    const numeric = section !== 'title' && /^-?\d+(\.\d+)?$/.test(cell.text) && cell.align !== 'left'
    master.value = numeric ? Number(cell.text) : cell.text
    if (numeric && cell.text.includes('.')) master.numFmt = '0.00'

    if (p.colSpan > 1 || p.rowSpan > 1) ws.mergeCells(p.row + 1, p.col + 1, p.row + p.rowSpan, p.col + p.colSpan)

    // Style every cell of the merged range so borders/fills render on all edges.
    for (let r = p.row; r < p.row + p.rowSpan; r++) {
      for (let c = p.col; c < p.col + p.colSpan; c++) {
        const target = ws.getCell(r + 1, c + 1)
        target.alignment = { horizontal: cell.align, vertical: 'middle', wrapText: true }
        target.font = { name: 'Calibri', size: section === 'title' ? (p.row === 1 ? 12 : 14) : 10, bold: !!cell.bold, color: { argb: textColor(cell.tone) } }
        if (section === 'title') {
          target.border = { top: thin, left: thin, right: thin, bottom: thin }
          continue
        }
        target.border = {
          top: section === 'head' && r === layout.rows.findIndex((x) => x.section === 'head') ? dbl : thin,
          left: thin,
          right: thin,
          bottom: section === 'head' && r + 1 > lastHeadRow ? dbl : thin,
        }
        if (p.warn) target.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: ARGB.warnFill } }
      }
    }
  }

  // Keep titles + two header rows + the first two columns visible while scrolling.
  ws.views = [{ state: 'frozen', xSplit: 2, ySplit: lastHeadRow + 1 }]

  const buf = await wb.xlsx.writeBuffer()
  downloadBlob(filename, new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }))
}
