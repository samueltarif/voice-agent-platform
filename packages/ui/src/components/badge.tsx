import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../class-names';

export const badgeVariants = cva(
  'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 select-none',
  {
    variants: {
      variant: {
        default: 'border-transparent bg-primary text-primary-foreground shadow-xs',
        secondary: 'border-transparent bg-secondary text-secondary-foreground',
        destructive: 'border-transparent bg-destructive text-destructive-foreground shadow-xs',
        outline: 'border-border text-foreground',
        success:
          'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300',
        warning:
          'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950/60 dark:text-amber-300',
        danger:
          'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-800 dark:bg-rose-950/60 dark:text-rose-300',
        handoff:
          'border-violet-200 bg-violet-50 text-violet-700 dark:border-violet-800 dark:bg-violet-950/60 dark:text-violet-300',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}
