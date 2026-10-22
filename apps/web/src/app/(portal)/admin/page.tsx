'use client';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { ExportButton } from '@/components/admin/kit';
import { ErrorState, Money, PageHeader, StatsCard } from '@/components/common';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { SkeletonRows } from '@/components/ui/skeleton';
import { api } from '@/lib/api';

export default function AdminOverview() {
  const q = useQuery({ queryKey: ['admin-overview'], queryFn: () => api.admin.overview(), refetchInterval: 60_000 });
  if (q.isLoading) return <SkeletonRows rows={6} />;
  if (q.isError || !q.data) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  const o = q.data;
  const queues = [
    { label: 'Chargers awaiting review', n: o.pendingChargerReviews, href: '/admin/verification?tab=chargers' },
    { label: 'Hosts awaiting identity review', n: o.pendingHostReviews, href: '/admin/verification?tab=hosts' },
    { label: 'Open disputes', n: o.disputes, href: '/admin/disputes' },
    { label: 'Open support tickets', n: o.openTickets, href: '/admin/support' },
    { label: 'Open safety incidents', n: o.openIncidents, href: '/admin/incidents' },
  ];
  return (
    <>
      <PageHeader title="Operations overview" description="Marketplace health. GMV is captured payments net of refunds." actions={<><ExportButton type="bookings" /><ExportButton type="payments" /></>} />
      {o.includesDemoPayments && <p className="mb-4 rounded-md border border-warning bg-demo-soft p-3 text-sm font-medium text-demo">Figures include DEMO PAYMENTS from local demo mode. They are not real revenue.</p>}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatsCard label="Active hosts" value={o.activeHosts} hint="With a live verified charger" />
        <StatsCard label="Verified chargers" value={o.verifiedChargers} />
        <StatsCard label="Bookings (30 days)" value={o.bookingsLast30d} hint={`${o.bookingsTotal} all time`} />
        <StatsCard label="Gross merchandise value" value={<Money minor={o.gmvMinor} />} />
        <StatsCard label="Commission recognised" value={<Money minor={o.commissionRecognizedMinor} />} hint="On settled / earned bookings only" />
        <StatsCard label="Cancellations" value={o.cancellations} />
        <StatsCard label="Dispute ratio" value={`${(o.disputeRatio * 100).toFixed(1)}%`} hint="Disputes ÷ completed bookings" tone={o.disputeRatio > 0.05 ? 'danger' : 'default'} />
        <StatsCard label="Open incidents" value={o.openIncidents} tone={o.openIncidents ? 'danger' : 'default'} />
      </div>
      <Card className="mt-6">
        <CardHeader><CardTitle>Work queues</CardTitle></CardHeader>
        <CardContent>
          <ul className="divide-y divide-line">
            {queues.map((x) => (
              <li key={x.label}><Link href={x.href} className="flex min-h-[48px] items-center justify-between text-sm hover:text-teal-strong"><span>{x.label}</span><span className={`rounded-pill px-3 py-0.5 font-semibold ${x.n ? 'bg-warning-soft text-warning-strong' : 'bg-background text-slate-strong'}`}>{x.n}</span></Link></li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </>
  );
}
