import type { CreditUnits, SessionKind, SlotWindows, TimetableSlot, Weekday } from './types'

export const THEORY_COLUMNS = ['Mini-proj', 'DBE', 'OS', 'CDT', 'DAA', 'STQA', 'MDM'] as const
export const PRACTICAL_COLUMNS = ['DBE', 'OS', 'CDT', 'STQA', 'MDM'] as const

export const DEFAULT_WINDOWS: SlotWindows = {
  slot1: { from: '08:30', to: '09:00' },
  slot2: { from: '13:45', to: '14:15' },
  slot3: { from: '17:00', to: '17:30' },
}

/** Matches the reference sheet: practical = per lab session, mini-project = per hour. */
export const DEFAULT_UNITS: CreditUnits = { practical: 'session', miniproj: 'hour' }

const hh = (h: number) => `${String(h).padStart(2, '0')}:00`

/** Expands a block like (Mon, 14-16, MDM, practical) into one slot per hour. */
function block(weekday: Weekday, from: number, to: number, subject: string, kind: SessionKind): TimetableSlot[] {
  return Array.from({ length: to - from }, (_, i) => ({
    weekday,
    start: hh(from + i),
    end: hh(from + i + 1),
    subject,
    kind,
    blockStart: hh(from),
  }))
}

/**
 * T.Y. B.Tech CSE Sem-I, Batch T1. Lunch (13:00-14:00) is not a slot.
 * Monday 16-17 Remedial/Tutorial spans several subjects, so it is kept for reference
 * but not credited (kind "remedial" is ignored by the engine).
 */
export const TY_CSE_T1_TIMETABLE: TimetableSlot[] = [
  // Monday
  ...block(1, 9, 10, 'OS', 'theory'),
  ...block(1, 10, 11, 'STQA', 'theory'),
  ...block(1, 11, 12, 'MDM', 'theory'),
  ...block(1, 12, 13, 'DBE', 'theory'),
  ...block(1, 14, 16, 'MDM', 'practical'),
  ...block(1, 16, 17, 'DAA/OS/DBE/STQA/MDM', 'remedial'),
  // Tuesday
  ...block(2, 9, 11, 'STQA', 'practical'),
  ...block(2, 11, 12, 'DBE', 'theory'),
  ...block(2, 12, 13, 'MDM', 'theory'),
  ...block(2, 14, 15, 'DAA', 'theory'),
  ...block(2, 15, 16, 'OS', 'theory'),
  ...block(2, 16, 17, 'STQA', 'theory'),
  // Wednesday
  ...block(3, 9, 11, 'DBE', 'practical'),
  ...block(3, 11, 12, 'STQA', 'theory'),
  ...block(3, 12, 13, 'DBE', 'theory'),
  ...block(3, 14, 15, 'DAA', 'theory'),
  ...block(3, 15, 17, 'Mini-proj', 'miniproj'),
  // Thursday
  ...block(4, 9, 10, 'STQA', 'theory'),
  ...block(4, 10, 11, 'OS', 'theory'),
  ...block(4, 11, 13, 'OS', 'practical'),
  ...block(4, 14, 15, 'DAA', 'theory'),
  ...block(4, 15, 16, 'MDM', 'theory'),
  ...block(4, 16, 17, 'CDT', 'theory'),
  // Friday
  ...block(5, 9, 10, 'MDM', 'theory'),
  ...block(5, 10, 11, 'DAA', 'theory'),
  ...block(5, 11, 13, 'CDT', 'practical'),
  ...block(5, 14, 15, 'OS', 'theory'),
  ...block(5, 15, 16, 'DBE', 'theory'),
  ...block(5, 16, 17, 'Mini-proj', 'miniproj'),
]
