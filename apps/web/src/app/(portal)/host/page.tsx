'use client';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight, CircleAlert } from 'lucide-react';
import Link from 'next/link';
import { ErrorState, Money, PageHeader, StatsCard, StatusBadge } from '@/components/common';
import { HostBookingsTable } from '@/components/host/booking-actions';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { SkeletonRows } from '@/components/ui/skeleton';
import { api } from '@/lib/api';
import { useSession } from '@/lib/session';

export default function HostDashboard() {
  const { user } = useSession();
  const host = user?.hostProfile;
  const earnings = useQuery({ queryKey: ['host-earnings'], queryFn: () => api.hosts.earnings() });
  const chargers = useQuery({ queryKey: ['my-chargers'], queryFn: () => api.chargers.mine() });
  const bookings = useQuery({
    queryKey: ['host-bookings', 'upcoming'],
    queryFn: () => api.bookings.hostQueue('upcoming'),
  });

  const pending = bookings.data?.filter((b) => b.status === 'AWAITING_HOST_APPROVAL') ?? [];
  const todo: Array<{ text: string; href: string }> = [];
  if (host && host.kycStatus !== 'VERIFIED')
    todo.push({
      text:
        host.kycStatus === 'PENDING_REVIEW'
          ? 'Identity verification is under review'
          : 'Verify your identity',
      href: '/host/profile',
    });
  if (chargers.data && chargers.data.length === 0)
    todo.push({ text: 'Add your first charger', href: '/host/chargers/new' });
  for (const c of chargers.data ?? []) {
    if (c.status === 'DRAFT' || c.status === 'REJECTED')
      todo.push({
        text: `Complete and submit “${c.title}” for review`,
        href: `/host/chargers/${c.id}`,
      });
    if (c.status === 'VERIFIED' && !c.isPublished)
      todo.push({
        text: `Publish “${c.title}” so drivers can find it`,
        href: `/host/chargers/${c.id}`,
      });
  }
  if (earnings.data && earnings.data.payoutAccountStatus !== 'ACTIVE')
    todo.push({ text: 'Set up payouts', href: '/host/earnings' });

  return (
    <>
      <PageHeader
        title={`Welcome${host ? `, ${host.displayName}` : ''}`}
        description="Your chargers, bookings and earnings at a glance."
        actions={
          <Button asChild>
            <Link href="/host/chargers/new">Add charger</Link>
          </Button>
        }
      />
      {earnings.isError ? (
        <ErrorState error={earnings.error} onRetry={() => earnings.refetch()} />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatsCard
            label="Pending earnings"
            value={earnings.data ? <Money minor={earnings.data.pendingMinor} /> : '…'}
            hint="Awaiting completion / dispute window"
          />
          <StatsCard
            label="Eligible for payout"
            value={earnings.data ? <Money minor={earnings.data.eligibleMinor} /> : '…'}
            hint="Owed to you — not yet transferred"
          />
          <StatsCard
            label="Paid out"
            value={earnings.data ? <Money minor={earnings.data.paidOutMinor} /> : '…'}
            hint="Confirmed with a bank reference"
          />
          <StatsCard
            label="Requests to review"
            value={pending.length}
            tone={pending.length ? 'warning' : 'default'}
          />
        </div>
      )}
      {todo.length > 0 && (
        <Card className="mt-6">
          <CardHeader>
            <CardTitle>Next steps</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="divide-y divide-line">
              {todo.map((t) => (
                <li key={t.text}>
                  <Link
                    href={t.href}
                    className="flex min-h-[44px] items-center justify-between gap-3 py-2 text-sm hover:text-teal-strong"
                  >
                    <span className="flex items-center gap-2">
                      <CircleAlert className="h-4 w-4 text-warning-strong" />
                      {t.text}
                    </span>
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Upcoming bookings</CardTitle>
          </CardHeader>
          {bookings.isLoading ? (
            <SkeletonRows />
          ) : bookings.isError ? (
            <ErrorState error={bookings.error} />
          ) : (
            <HostBookingsTable
              bookings={(bookings.data ?? []).slice(0, 8)}
              emptyTitle="No upcoming bookings"
            />
          )}
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Your chargers</CardTitle>
          </CardHeader>
          <CardContent>
            {chargers.isLoading ? (
              <SkeletonRows rows={2} />
            ) : (
              <ul className="space-y-3">
                {(chargers.data ?? []).map((c) => (
                  <li key={c.id}>
                    <Link
                      href={`/host/chargers/${c.id}`}
                      className="flex items-center justify-between gap-2 rounded-md p-2 hover:bg-background"
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-semibold">{c.title}</span>
                        <span className="text-xs text-slate-strong">{c.locality}</span>
                      </span>
                      <span className="flex shrink-0 flex-col items-end gap-1">
                        <StatusBadge status={c.status} />
                        {c.isPublished ? (
                          <span className="text-xs text-positive-strong">Live</span>
                        ) : (
                          <span className="text-xs text-slate-strong">Hidden</span>
                        )}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
