import { zodResolver } from '@hookform/resolvers/zod'
import { Fingerprint } from 'lucide-react'
import { useForm } from 'react-hook-form'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { z } from 'zod'
import { errorMessage, USE_MOCK } from '@/api/client'
import { useAuth } from '@/auth/AuthContext'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Field, Input } from '@/components/ui/form'

const schema = z.object({
  email: z.string().min(1, 'Email is required').email('Enter a valid email'),
  password: z.string().min(1, 'Password is required'),
})
type Values = z.infer<typeof schema>

export default function LoginPage() {
  const { user, login } = useAuth()
  const navigate = useNavigate()
  const from = (useLocation().state as { from?: string } | null)?.from ?? '/dashboard'

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<Values>({ resolver: zodResolver(schema) })

  if (user) return <Navigate to={from} replace />

  const onSubmit = async (v: Values) => {
    try {
      const u = await login(v.email, v.password)
      toast.success(`Welcome back, ${u.name}`)
      navigate(from, { replace: true })
    } catch (e) {
      setError('root', { message: errorMessage(e, 'Sign-in failed') })
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-sm p-6">
        <div className="mb-5 flex items-center gap-2">
          <div className="rounded-md bg-primary p-2 text-primary-foreground">
            <Fingerprint className="h-5 w-5" aria-hidden />
          </div>
          <div>
            <h1 className="text-base font-semibold">Attendance Admin</h1>
            <p className="text-xs text-muted-foreground">Sign in to continue</p>
          </div>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-3" noValidate>
          <Field label="Email" htmlFor="email" error={errors.email?.message}>
            <Input id="email" type="email" autoComplete="username" aria-invalid={!!errors.email} {...register('email')} />
          </Field>
          <Field label="Password" htmlFor="password" error={errors.password?.message}>
            <Input id="password" type="password" autoComplete="current-password" aria-invalid={!!errors.password} {...register('password')} />
          </Field>
          {errors.root && (
            <p role="alert" className="rounded-md bg-destructive/10 px-2.5 py-1.5 text-xs text-destructive">
              {errors.root.message}
            </p>
          )}
          <Button type="submit" className="w-full" loading={isSubmitting}>
            Sign in
          </Button>
        </form>

        {USE_MOCK && (
          <div className="mt-4 rounded-md bg-muted p-2.5 text-xs text-muted-foreground">
            <p className="mb-1 font-medium text-foreground">Demo accounts (mock API)</p>
            <p>admin@school.edu / admin123</p>
            <p>operator@school.edu / operator123</p>
            <p>viewer@school.edu / viewer123</p>
          </div>
        )}
      </Card>
    </div>
  )
}
