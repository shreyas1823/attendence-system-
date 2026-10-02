import { Bell, ClipboardCheck, Cpu, FileBarChart, GraduationCap, LayoutDashboard, ScrollText, type LucideIcon } from 'lucide-react'
import type { Permission } from '@/auth/permissions'

export interface NavItem {
  to: string
  label: string
  icon: LucideIcon
  permission: Permission
}

export const NAV: NavItem[] = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, permission: 'attendance.view' },
  { to: '/students', label: 'Students', icon: GraduationCap, permission: 'students.view' },
  { to: '/attendance', label: 'Attendance', icon: ClipboardCheck, permission: 'attendance.view' },
  { to: '/reports', label: 'Reports', icon: FileBarChart, permission: 'attendance.view' },
  { to: '/notifications', label: 'Notifications', icon: Bell, permission: 'attendance.view' },
  { to: '/devices', label: 'Devices', icon: Cpu, permission: 'devices.view' },
  { to: '/audit', label: 'Audit Logs', icon: ScrollText, permission: 'audit.view' },
]

export const ROUTE_LABELS: Record<string, string> = {
  ...Object.fromEntries(NAV.map((n) => [n.to.slice(1), n.label])),
  sheet: 'Attendance sheet',
}
