import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { StudentBiometricStatus } from './StudentBiometricStatus'

describe('StudentBiometricStatus', () => {
  it('shows slot 1 enrolled and slot 2 empty', () => {
    render(<StudentBiometricStatus enrollments={[{ finger_slot: 1, enrolled_at: '2026-09-01T08:00:00Z' }]} />)
    expect(screen.getByText('1 of 2 enrolled')).toBeInTheDocument()
    expect(within(screen.getByTestId('slot-1')).getByText('Enrolled')).toBeInTheDocument()
    expect(within(screen.getByTestId('slot-2')).getByText('Empty')).toBeInTheDocument()
  })

  it('offers Enroll only for empty slots and only when permitted', async () => {
    const onEnroll = vi.fn()
    const { rerender } = render(
      <StudentBiometricStatus enrollments={[{ finger_slot: 1, enrolled_at: '2026-09-01T08:00:00Z' }]} canEnroll onEnroll={onEnroll} />,
    )
    expect(screen.queryByRole('button', { name: /enroll fingerprint 1/i })).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /enroll fingerprint 2/i }))
    expect(onEnroll).toHaveBeenCalledWith(2)

    rerender(<StudentBiometricStatus enrollments={[]} />)
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('only shows Remove when allowed', () => {
    const e = [{ finger_slot: 1 as const, enrolled_at: '2026-09-01T08:00:00Z' }]
    const { rerender } = render(<StudentBiometricStatus enrollments={e} />)
    expect(screen.queryByRole('button', { name: /remove/i })).not.toBeInTheDocument()
    rerender(<StudentBiometricStatus enrollments={e} canRemove />)
    expect(screen.getByRole('button', { name: /remove fingerprint 1/i })).toBeInTheDocument()
  })
})
