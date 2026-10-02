import type { CellDef, RowInput } from 'jspdf-autotable'
import type { SheetCell, SheetLayout } from '@/report-engine/layout'

const BRAND: [number, number, number] = [192, 0, 0]
const RED: [number, number, number] = [185, 28, 28]
const GREEN: [number, number, number] = [22, 101, 52]
const GREY: [number, number, number] = [107, 114, 128]

function toCell(c: SheetCell, fill?: [number, number, number]): CellDef {
  const color = c.tone === 'red' ? BRAND : c.tone === 'danger' ? RED : c.tone === 'ok' ? GREEN : c.tone === 'muted' ? GREY : undefined
  return {
    content: c.text,
    colSpan: c.colSpan,
    rowSpan: c.rowSpan,
    styles: {
      halign: c.align,
      valign: 'middle',
      fontStyle: c.bold ? 'bold' : 'normal',
      ...(color ? { textColor: color } : {}),
      ...(fill ? { fillColor: fill } : {}),
    },
  }
}

/** A4 landscape PDF with the same header block, merged headers and highlights as the screen. */
export async function exportReportPdf(layout: SheetLayout, filename: string) {
  const [{ jsPDF }, { default: autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')])
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })
  const pageW = doc.internal.pageSize.getWidth()

  // Boxed title lines, as on the institutional sheet
  const left = 8
  const width = pageW - 16
  let y = 8
  layout.rows
    .filter((r) => r.section === 'title')
    .forEach((row, i) => {
      doc.setLineWidth(0.3).rect(left, y, width, 7)
      doc.setFont('helvetica', 'bold').setFontSize(i === 1 ? 10 : 12)
      doc.text(row.cells[0].text, pageW / 2, y + 5, { align: 'center' })
      y += 7
    })

  const head: RowInput[] = layout.rows.filter((r) => r.section === 'head').map((r) => r.cells.map((c) => toCell(c)))
  const body: RowInput[] = layout.rows
    .filter((r) => r.section === 'engaged' || r.section === 'body')
    .map((r) => r.cells.map((c) => toCell(c, r.warn ? [251, 213, 181] : undefined)))

  autoTable(doc, {
    startY: y,
    head,
    body,
    theme: 'grid',
    margin: { left: 8, right: 8 },
    styles: { fontSize: 7, cellPadding: 1, lineColor: [0, 0, 0], lineWidth: 0.15, textColor: [0, 0, 0] },
    headStyles: { lineWidth: 0.5, textColor: [0, 0, 0], fillColor: [255, 255, 255] },
    columnStyles: { 0: { cellWidth: 10 }, 1: { cellWidth: 44, halign: 'left' } },
    showHead: 'everyPage', // repeat the two-level header on every page
    rowPageBreak: 'avoid',
  })

  doc.save(filename)
}
