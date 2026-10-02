import { describe, expect, it } from 'vitest'
import { can } from './permissions'

describe('RBAC permission map', () => {
  it('gives admin full access', () => {
    for (const p of ['devices.manage', 'audit.view', 'biometric.remove', 'attendance.correct'] as const) {
      expect(can('admin', p)).toBe(true)
    }
  })

  it('lets operators enroll and correct but not manage devices or read audit logs', () => {
    expect(can('operator', 'biometric.enroll')).toBe(true)
    expect(can('operator', 'attendance.correct')).toBe(true)
    expect(can('operator', 'devices.manage')).toBe(false)
    expect(can('operator', 'audit.view')).toBe(false)
  })

  it('keeps viewers read-only', () => {
    expect(can('viewer', 'attendance.view')).toBe(true)
    expect(can('viewer', 'attendance.correct')).toBe(false)
    expect(can('viewer', 'biometric.enroll')).toBe(false)
    expect(can('viewer', 'reports.sync')).toBe(false)
  })

  it('denies everything when there is no role', () => {
    expect(can(undefined, 'attendance.view')).toBe(false)
  })
})
