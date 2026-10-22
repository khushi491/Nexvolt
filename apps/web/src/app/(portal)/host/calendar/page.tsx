'use client';
import { useQuery } from '@tanstack/react-query';
import { addMinutes, BOOKING_STATUS_DISPLAY } from '@nexvolt/shared';
import { ErrorState, PageHeader } from '@/components/common';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { SkeletonRows } from '@/components/ui/skeleton';
import { api } from '@/lib/api';
import { istDateKey, istDay, istTime } from '@/lib/time';

/** 14-day agenda across all chargers, with blackouts. */
export default function CalendarPage() {
  const bookings = useQuery({ queryKey: ['host-bookings', 'calendar'], queryFn: () => api.bookings.hostQueue('upcoming') });
  const chargers = useQuery({ queryKey: ['my-chargers'], queryFn: () => api.chargers.mine() });
  if (bookings.isLoading || chargers.isLoading) return <SkeletonRows rows={6} />;
  if (bookings.isError) return <ErrorState error={bookings.error} />;
  const days = Array.from({ length: 14 }, (_, i) => istDateKey(addMinutes(new Date(), i * 1440).toISOString()));
  const active = (bookings.data ?? []).filter((b) => !['CANCELLED', 'EXPIRED', 'FAILED'].includes(b.status));
  return (
    <>
      <PageHeader title="Calendar" description="Next 14 days across all your chargers (IST). Edit hours and blackout dates from each charger’s Availability tab." />
      <div className="space-y-3">
        {days.map((d) => {
          const items = active.filter((b) => istDateKey(b.startAt) === d);
          const blackouts = (chargers.data ?? []).flatMap((c) => c.exceptions.filter((e) => e.date === d).map((e) => ({ c, e })));
          return (
            <Card key={d}>
              <CardContent className="flex flex-col gap-3 p-4 sm:flex-row">
                <p className="w-36 shrink-0 text-sm font-semibold">{istDay(`${d}T12:00:00+05:30`)}</p>
                <div className="flex-1 space-y-2">
                  {blackouts.map(({ c, e }) => <p key={e.id} className="text-sm text-warning-strong">{e.type === 'BLACKOUT' ? 'Closed' : 'Custom hours'} · {c.title}{e.reason ? ` — ${e.reason}` : ''}</p>)}
                  {items.length === 0 && blackouts.length === 0 && <p className="text-sm text-slate-strong">No bookings</p>}
                  {items.map((b) => (
                    <div key={b.id} className="flex flex-wrap items-center gap-2 rounded-md bg-background px-3 py-2 text-sm">
                      <span className="font-semibold tabular-nums">{istTime(b.startAt)}–{istTime(b.endAt)}</span>
                      <span>{b.charger.title}</span>
                      <span className="text-slate-strong">{b.code} · {b.driver?.name ?? 'Driver'}</span>
                      <Badge tone={BOOKING_STATUS_DISPLAY[b.status].tone}>{BOOKING_STATUS_DISPLAY[b.status].label}</Badge>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </>
  );
}
