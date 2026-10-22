'use client';
import { useQuery } from '@tanstack/react-query';
import { FlaskConical } from 'lucide-react';
import { api } from '@/lib/api';

/** Always-visible notice when the backend runs with demo payments / OTP emulator. */
export function DemoBanner() {
  const { data } = useQuery({ queryKey: ['health'], queryFn: () => api.health(), staleTime: 60_000 });
  if (!data?.demoMode) return null;
  return (
    <div role="note" className="flex items-center justify-center gap-2 border-b border-warning bg-demo-soft px-4 py-2 text-center text-xs font-semibold text-demo">
      <FlaskConical className="h-4 w-4" aria-hidden />
      LOCAL DEMO MODE — payments are simulated (DEMO PAYMENT), OTPs come from the emulator, listings marked SAMPLE are fictional.
    </div>
  );
}
