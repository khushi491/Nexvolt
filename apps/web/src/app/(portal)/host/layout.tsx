'use client';
import { useRouter } from 'next/navigation';
import { useEffect, type ReactNode } from 'react';
import { useSession } from '@/lib/session';

export default function HostLayout({ children }: { children: ReactNode }) {
  const { hasRole } = useSession();
  const router = useRouter();
  const isHost = hasRole('HOST');
  useEffect(() => {
    if (!isHost) router.replace('/onboarding');
  }, [isHost, router]);
  return isHost ? <>{children}</> : null;
}
