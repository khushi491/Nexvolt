'use client';
import { BookingStatus } from '@nexvolt/shared';
import Link from 'next/link';
import { ExportButton, FilterBar, Pager, usePaged } from '@/components/admin/kit';
import { BookingStatusBadge, DemoPaymentBadge, EmptyState, ErrorState, Money, PageHeader, SampleBadge } from '@/components/common';
import { Card } from '@/components/ui/card';
import { SkeletonRows } from '@/components/ui/skeleton';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { api } from '@/lib/api';
import { istDay, istTime } from '@/lib/time';

export default function AdminBookings() {
  const p = usePaged('admin-bookings', api.admin.bookings);
  const { query } = p;
  return (
    <>
      <PageHeader title="Bookings" description="Search by booking code (e.g. NV-ABC123) or charger name." actions={<ExportButton type="bookings" />} />
      <FilterBar search={p.q} onSearch={p.setQ} statuses={Object.values(BookingStatus)} status={p.status} onStatus={p.setStatus} />
      <Card>
        {query.isLoading ? <SkeletonRows /> : query.isError ? <ErrorState error={query.error} /> : !query.data?.items.length ? <EmptyState title="No bookings match" /> : (
          <>
            <Table>
              <THead><TR><TH>Booking</TH><TH>Charger</TH><TH>When (IST)</TH><TH>Status</TH><TH>Total</TH></TR></THead>
              <TBody>
                {query.data.items.map((b) => (
                  <TR key={b.id}>
                    <TD><Link href={`/admin/bookings/${b.id}`} className="font-semibold text-teal-strong hover:underline">{b.code}</Link><div className="mt-1 flex gap-1">{b.charger.isSample && <SampleBadge />}{b.payment?.isDemo && <DemoPaymentBadge />}</div></TD>
                    <TD>{b.charger.title}<div className="text-xs text-slate-strong">{b.driver?.name} · {b.driver?.phoneMasked}</div></TD>
                    <TD>{istDay(b.startAt)}<div className="text-xs text-slate-strong">{istTime(b.startAt)}–{istTime(b.endAt)}</div></TD>
                    <TD><BookingStatusBadge status={b.status} /></TD>
                    <TD><Money minor={b.pricing.totalMinor} /></TD>
                  </TR>
                ))}
              </TBody>
            </Table>
            <Pager offset={p.offset} limit={p.limit} total={query.data.total} onChange={p.setOffset} />
          </>
        )}
      </Card>
    </>
  );
}
