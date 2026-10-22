'use client';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { SkeletonRows } from '@/components/ui/skeleton';
import { useSession } from '@/lib/session';

export default function Home() {
  const router = useRouter();
  const { status, hasRole } = useSession();
  useEffect(() => {
    if (status === 'loading') return;
    if (status === 'anonymous') router.replace('/login');
    else if (hasRole('ADMIN', 'SUPPORT')) router.replace('/admin');
    else if (hasRole('HOST')) router.replace('/host');
    else router.replace('/onboarding');
  }, [status, hasRole, router]);
  return <SkeletonRows rows={3} />;
}
