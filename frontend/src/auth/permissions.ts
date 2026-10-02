import type { Role } from '@/types'

/** Capability map — single source of truth for both route guards and in-page controls. */
export const PERMISSIONS = {
  'attendance.view': ['admin', 'operator', 'viewer'],
  'students.view': ['admin', 'operator', 'viewer'],
  'students.register': ['admin', 'operator'],
  'biometric.enroll': ['admin', 'operator'],
  'biometric.remove': ['admin'],
  'attendance.correct': ['admin', 'operator'],
  'reports.export': ['admin', 'operator', 'viewer'],
  'reports.warn': ['admin', 'operator'],
  'reports.sync': ['admin', 'operator'],
  'notifications.retry': ['admin', 'operator'],
  'devices.view': ['admin', 'operator', 'viewer'],
  'devices.enrollment_mode': ['admin', 'operator'],
  'devices.manage': ['admin'],
  'audit.view': ['admin'],
} as const satisfies Record<string, readonly Role[]>

export type Permission = keyof typeof PERMISSIONS

export const can = (role: Role | undefined, permission: Permission): boolean =>
  !!role && (PERMISSIONS[permission] as readonly Role[]).includes(role)
