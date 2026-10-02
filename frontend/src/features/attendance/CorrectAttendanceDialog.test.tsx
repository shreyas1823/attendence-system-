import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { qk } from '@/hooks/queries'
import { renderWithProviders } from '@/test/utils'
import type { AttendanceFilters, AttendanceRow } from '@/types'
import { CorrectAttendanceDialog, correctionSchema } from './CorrectAttendanceDialog'

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
vi.mock('@/api/services', async (orig) => ({
  ...(await orig<typeof import('@/api/services')>()),
  attendanceApi: { list: vi.fn(), correct: vi.fn() },
}))
import { attendanceApi } from '@/api/services'

const row: AttendanceRow = {
  id: 'a1',
  student_id: 's1',
  student_name: 'Aarav Sharma',
  roll_no: '2401',
  class_name: 'CSE-A',
  department: 'Computer Science',
  scan_time_1: null,
  scan_time_2: null,
  status: 'absent',
  attendance_date: '2026-10-02',
  corrections: [
    {
      id: 'c0',
      attendance_id: 'a1',
      original_status: 'present',
      new_status: 'absent',
      reason: 'Duplicate scan removed',
      corrected_by: 'u1',
      corrected_by_name: 'Asha Rao',
      timestamp: '2026-10-01T10:00:00.000Z',
    },
  ],
}
const filters: AttendanceFilters = { date: '2026-10-02', class_id: '', status: '' }

describe('correctionSchema', () => {
  it('requires a reason of at least 10 characters', () => {
    expect(correctionSchema.safeParse({ new_status: 'present', reason: '' }).success).toBe(false)
    expect(correctionSchema.safeParse({ new_status: 'present', reason: 'too short' }).success).toBe(false)
    expect(correctionSchema.safeParse({ new_status: 'present', reason: '   padded    ' }).success).toBe(false)
    expect(correctionSchema.safeParse({ new_status: 'present', reason: 'Sensor failed three times' }).success).toBe(true)
  })
})

describe('CorrectAttendanceDialog', () => {
  beforeEach(() => vi.clearAllMocks())

  it('shows previous adjustments and blocks submit without a reason', async () => {
    const user = userEvent.setup()
    renderWithProviders(<CorrectAttendanceDialog row={row} onClose={vi.fn()} />)

    expect(screen.getByText('Duplicate scan removed')).toBeInTheDocument()
    expect(screen.getByText(/Asha Rao/)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /save correction/i }))
    expect(await screen.findByText('A reason is required')).toBeInTheDocument()
    expect(attendanceApi.correct).not.toHaveBeenCalled()
  })

  it('optimistically updates cached rows, then keeps them on success', async () => {
    const user = userEvent.setup()
    vi.mocked(attendanceApi.correct).mockResolvedValue({ ...row, status: 'present' })
    const onClose = vi.fn()
    const { client } = renderWithProviders(<CorrectAttendanceDialog row={row} onClose={onClose} />)
    client.setQueryData(qk.attendance(filters), [row])

    await user.type(screen.getByLabelText(/reason for adjustment/i), 'Teacher confirmed in person')
    await user.click(screen.getByRole('button', { name: /save correction/i }))

    await waitFor(() => expect(attendanceApi.correct).toHaveBeenCalled())
    expect(vi.mocked(attendanceApi.correct).mock.calls[0][0]).toEqual({
      attendance_id: 'a1',
      new_status: 'present',
      reason: 'Teacher confirmed in person',
    })
    expect(onClose).toHaveBeenCalled()
  })

  it('rolls the cached row back when the server rejects the correction', async () => {
    const user = userEvent.setup()
    let reject!: (e: Error) => void
    vi.mocked(attendanceApi.correct).mockReturnValue(new Promise((_, r) => (reject = r)))
    const { client } = renderWithProviders(<CorrectAttendanceDialog row={row} onClose={vi.fn()} />)
    client.setQueryData(qk.attendance(filters), [row])

    await user.type(screen.getByLabelText(/reason for adjustment/i), 'Teacher confirmed in person')
    await user.click(screen.getByRole('button', { name: /save correction/i }))

    // Optimistic state is visible while the request is in flight.
    await waitFor(() => {
      const [cached] = client.getQueryData<AttendanceRow[]>(qk.attendance(filters))!
      expect(cached.status).toBe('present')
      expect(cached.corrections).toHaveLength(2)
    })

    reject(new Error('boom'))
    await waitFor(() => {
      const [cached] = client.getQueryData<AttendanceRow[]>(qk.attendance(filters))!
      expect(cached.status).toBe('absent')
      expect(cached.corrections).toHaveLength(1)
    })
  })
})
