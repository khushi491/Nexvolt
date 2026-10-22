'use client';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { ErrorState, PageHeader } from '@/components/common';
import { HostBookingsTable } from '@/components/host/booking-actions';
import { Card } from '@/components/ui/card';
import { SkeletonRows } from '@/components/ui/skeleton';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';

const FILTERS = [
  {
    id: 'requests',
    label: 'Requests',
    scope: 'upcoming' as const,
    status: 'AWAITING_HOST_APPROVAL',
  },
  { id: 'upcoming', label: 'Upcoming', scope: 'upcoming' as const },
  { id: 'active', label: 'In progress', scope: 'all' as const, status: 'CHARGING' },
  { id: 'disputed', label: 'Disputed', scope: 'all' as const, status: 'DISPUTED' },
  { id: 'past', label: 'Past', scope: 'past' as const },
];

export default function HostBookingsPage() {
  const [f, setF] = useState(FILTERS[1]!);
  const q = useQuery({
    queryKey: ['host-bookings', f.id],
    queryFn: () => api.bookings.hostQueue(f.scope, f.status),
    refetchInterval: 30_000,
  });
  return (
    <>
      <PageHeader
        title="Bookings"
        description="Approve requests, check drivers in and confirm meter readings. Earnings shown are before gateway fees."
      />
      <div className="mb-4 flex flex-wrap gap-2" role="group" aria-label="Filter bookings">
        {FILTERS.map((x) => (
          <button
            key={x.id}
            onClick={() => setF(x)}
            aria-pressed={f.id === x.id}
            className={cn(
              'min-h-[40px] rounded-pill border px-4 text-sm font-semibold',
              f.id === x.id
                ? 'border-navy bg-navy text-white'
                : 'border-line-strong bg-white text-navy hover:bg-background',
            )}
          >
            {x.label}
          </button>
        ))}
      </div>
      <Card>
        {q.isLoading ? (
          <SkeletonRows />
        ) : q.isError ? (
          <ErrorState error={q.error} onRetry={() => q.refetch()} />
        ) : (
          <HostBookingsTable
            bookings={q.data ?? []}
            emptyTitle={`No ${f.label.toLowerCase()} bookings`}
          />
        )}
      </Card>
      <p className="mt-3 text-xs text-slate-strong">
        * Your share after Nexvolt commission, before payment-gateway fees. Final amounts appear in
        Earnings.
      </p>
    </>
  );
}
