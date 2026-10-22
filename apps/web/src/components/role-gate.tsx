'use client';
import type { Role } from '@nexvolt/shared';
import { Lock } from 'lucide-react';
import type { ReactNode } from 'react';
import { useSession } from '@/lib/session';
import { EmptyState } from './common';

export function RoleGate({ roles, children }: { roles: Role[]; children: ReactNode }) {
  const { hasRole } = useSession();
  if (!hasRole(...roles)) return <EmptyState icon={<Lock className="h-6 w-6" />} title="You don’t have access to this area" description="Ask an administrator if you believe this is a mistake." />;
  return <>{children}</>;
}
