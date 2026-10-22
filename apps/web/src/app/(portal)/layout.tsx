'use client';
import { useRouter } from 'next/navigation';
import { useEffect, type ReactNode } from 'react';
import { AppShell } from '@/components/app-shell';
import { SkeletonRows } from '@/components/ui/skeleton';
import { useSession } from '@/lib/session';

/** Client-side guard for UX only — every API call is authorised server-side. */
export default function PortalLayout({ children }: { children: ReactNode }) {
  const { status } = useSession();
  const router = useRouter();
  useEffect(() => {
    if (status === 'anonymous') router.replace('/login');
  }, [status, router]);
  if (status !== 'authenticated') return <div className="mx-auto max-w-3xl p-8"><SkeletonRows rows={5} /></div>;
  return <AppShell>{children}</AppShell>;
}
