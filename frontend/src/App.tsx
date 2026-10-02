import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { lazy, Suspense, useState } from 'react'
import { createBrowserRouter, Navigate, RouterProvider } from 'react-router-dom'
import { Toaster } from 'sonner'
import { AuthProvider } from '@/auth/AuthContext'
import { RequireAuth, RequirePermission } from '@/auth/guards'
import { AppShell } from '@/components/layout/AppShell'
import { Skeleton } from '@/components/ui/skeleton'

const LoginPage = lazy(() => import('@/pages/LoginPage'))
const DashboardPage = lazy(() => import('@/pages/DashboardPage'))
const StudentsPage = lazy(() => import('@/pages/StudentsPage'))
const AttendancePage = lazy(() => import('@/pages/AttendancePage'))
const ReportsPage = lazy(() => import('@/pages/ReportsPage'))
const AttendanceSheetPage = lazy(() => import('@/pages/AttendanceSheetPage'))
const NotificationsPage = lazy(() => import('@/pages/NotificationsPage'))
const DevicesPage = lazy(() => import('@/pages/DevicesPage'))
const AuditPage = lazy(() => import('@/pages/AuditPage'))
const NotFoundPage = lazy(() => import('@/pages/NotFoundPage'))

export function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 15_000,
        refetchOnWindowFocus: false,
        retry: (count, err) => {
          const status = (err as { response?: { status?: number } }).response?.status
          return !(status && status >= 400 && status < 500) && count < 2 // never retry 4xx
        },
      },
    },
  })
}

const PageFallback = () => (
  <div className="space-y-3" aria-busy="true">
    <Skeleton className="h-6 w-48" />
    <Skeleton className="h-64 w-full" />
  </div>
)

export const routes = [
  { path: '/login', element: <LoginPage /> },
  {
    element: <RequireAuth />,
    children: [
      {
        element: <AppShell />,
        children: [
          { index: true, element: <Navigate to="/dashboard" replace /> },
          // Each guard maps a route group to a capability from auth/permissions.ts.
          { element: <RequirePermission permission="attendance.view" />, children: [
            { path: 'dashboard', element: <DashboardPage /> },
            { path: 'attendance', element: <AttendancePage /> },
            { path: 'reports', element: <ReportsPage /> },
            { path: 'reports/sheet', element: <AttendanceSheetPage /> },
            { path: 'notifications', element: <NotificationsPage /> },
          ] },
          { element: <RequirePermission permission="students.view" />, children: [{ path: 'students', element: <StudentsPage /> }] },
          { element: <RequirePermission permission="devices.view" />, children: [{ path: 'devices', element: <DevicesPage /> }] },
          { element: <RequirePermission permission="audit.view" />, children: [{ path: 'audit', element: <AuditPage /> }] },
          { path: '*', element: <NotFoundPage /> },
        ],
      },
    ],
  },
]

const router = createBrowserRouter(routes)

export default function App() {
  const [client] = useState(makeQueryClient)
  return (
    <QueryClientProvider client={client}>
      <AuthProvider>
        <Suspense fallback={<PageFallback />}>
          <RouterProvider router={router} />
        </Suspense>
        <Toaster position="top-right" richColors closeButton />
      </AuthProvider>
    </QueryClientProvider>
  )
}
