import { useMemo } from 'react'
import { cn } from '@/lib/utils'
import { placeCells, type SheetCell, type SheetLayout } from '@/report-engine/layout'

const HEAD_H = 'h-7' // keep in sync with the sticky offset of header row 2 (top-7)
const WARN_BG = 'bg-[#fbd5b5]'

function toneClass(c: SheetCell) {
  switch (c.tone) {
    case 'red':
      return 'text-[#c00000]'
    case 'ok':
      return 'text-success'
    case 'danger':
      return 'text-destructive'
    case 'muted':
      return 'text-muted-foreground'
    default:
      return ''
  }
}

/**
 * Renders the institutional sheet from the shared layout. The boxed title lines sit above the
 * table (so they stay centred on narrow screens); the two header rows and the Roll/Name columns
 * are sticky while the table scrolls.
 */
export function AttendanceSheetTable({ layout }: { layout: SheetLayout }) {
  const titles = layout.rows.filter((r) => r.section === 'title')
  const firstRow = layout.rows.findIndex((r) => r.section !== 'title')
  const lastHead = layout.rows.map((r) => r.section).lastIndexOf('head')

  const rows = useMemo(() => {
    const placed = placeCells(layout).filter((p) => p.section !== 'title')
    return layout.rows.slice(firstRow).map((row, i) => ({ row, cells: placed.filter((p) => p.row === firstRow + i) }))
  }, [layout, firstRow])

  return (
    <div className="rounded-lg border bg-card shadow-sm">
      <div className="border-b-2 border-foreground/70" role="group" aria-label="Report title">
        {titles.map((t, i) => (
          <p
            key={i}
            className={cn(
              'border-x-2 border-t border-foreground/60 px-4 py-1.5 text-center font-bold first:border-t-2',
              i === 1 ? 'text-base font-semibold' : 'text-lg',
            )}
          >
            {t.cells[0].text}
          </p>
        ))}
      </div>

      <div className="max-h-[70vh] overflow-auto" role="region" aria-label="Attendance summary table" tabIndex={0}>
        <table className="w-max min-w-full border-collapse border-2 border-foreground/70 text-xs tabular-nums">
          <tbody>
            {rows.map(({ row, cells }, ri) => (
              <tr key={ri}>
                {cells.map((p) => {
                  const isHead = row.section === 'head'
                  const stickyLeft = p.col < 2
                  const bg = row.warn ? WARN_BG : 'bg-card'
                  return (
                    <td
                      key={`${p.row}-${p.col}`}
                      colSpan={p.colSpan}
                      rowSpan={p.rowSpan}
                      className={cn(
                        'border border-foreground/50 px-2 py-1',
                        bg,
                        isHead && HEAD_H,
                        // double rule above the first header row and below the last one
                        isHead && p.row === firstRow && 'border-t-4 border-double border-t-foreground/70',
                        isHead && p.row + p.rowSpan - 1 === lastHead && 'border-b-4 border-double border-b-foreground/70',
                        isHead && 'sticky z-20',
                        isHead && (p.row === firstRow ? 'top-0' : 'top-7'),
                        stickyLeft && !isHead && 'sticky z-10',
                        stickyLeft && isHead && 'z-30',
                        p.col === 0 && stickyLeft && 'left-0 w-14 min-w-[3.5rem] max-w-[3.5rem]',
                        p.col === 1 && stickyLeft && 'left-14 min-w-[14rem]',
                        p.cell.align === 'left' ? 'text-left' : p.cell.align === 'right' ? 'text-right' : 'text-center',
                        p.cell.bold && 'font-bold',
                        toneClass(p.cell),
                      )}
                    >
                      {p.cell.text}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
