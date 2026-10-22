import { cva, type VariantProps } from 'class-variance-authority';
import type { HTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

const badgeVariants = cva(
  'inline-flex items-center gap-1 rounded-pill px-2.5 py-0.5 text-xs font-semibold',
  {
    variants: {
      tone: {
        neutral: 'bg-[#EEF2F7] text-slate-strong',
        info: 'bg-teal-soft text-teal-strong',
        positive: 'bg-positive-soft text-positive-strong',
        warning: 'bg-warning-soft text-warning-strong',
        danger: 'bg-danger-soft text-danger-strong',
        demo: 'bg-demo-soft text-demo border border-warning',
        navy: 'bg-navy text-white',
      },
    },
    defaultVariants: { tone: 'neutral' },
  },
);

export interface BadgeProps
  extends HTMLAttributes<HTMLSpanElement>, VariantProps<typeof badgeVariants> {}
export const Badge = ({ className, tone, ...p }: BadgeProps) => (
  <span className={cn(badgeVariants({ tone }), className)} {...p} />
);
