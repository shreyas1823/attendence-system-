import { cva, type VariantProps } from 'class-variance-authority'
import * as React from 'react'
import { cn } from '@/lib/utils'

const badgeVariants = cva(
  'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium leading-none',
  {
    variants: {
      variant: {
        default: 'border-transparent bg-muted text-foreground',
        success: 'border-success/20 bg-success/10 text-success',
        danger: 'border-destructive/20 bg-destructive/10 text-destructive',
        warning: 'border-warning/20 bg-warning/10 text-warning',
        info: 'border-primary/20 bg-primary/10 text-primary',
        outline: 'text-muted-foreground',
      },
    },
    defaultVariants: { variant: 'default' },
  },
)

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement>, VariantProps<typeof badgeVariants> {}

export const Badge = ({ className, variant, ...props }: BadgeProps) => (
  <span className={cn(badgeVariants({ variant }), className)} {...props} />
)
