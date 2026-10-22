'use client';
import { ChargerStatus } from '@nexvolt/shared';
import Link from 'next/link';
import { FilterBar, Pager, usePaged } from '@/components/admin/kit';
import { EmptyState, ErrorState, Money, PageHeader, SampleBadge, StatusBadge } from '@/components/common';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { SkeletonRows } from '@/components/ui/skeleton';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { api } from '@/lib/api';

export default function AdminChargers() {
  const p = usePaged('admin-chargers', api.admin.chargers);
  const { query } = p;
  return (
    <>
      <PageHeader title="Chargers" description="All listings. Only VERIFIED + published chargers are visible to drivers." />
      <FilterBar search={p.q} onSearch={p.setQ} statuses={Object.values(ChargerStatus)} status={p.status} onStatus={p.setStatus} />
      <Card>
        {query.isLoading ? <SkeletonRows /> : query.isError ? <ErrorState error={query.error} /> : !query.data?.items.length ? <EmptyState title="No chargers match" /> : (
          <>
            <Table>
              <THead><TR><TH>Charger</TH><TH>Host</TH><TH>Status</TH><TH>Power</TH><TH>Price</TH></TR></THead>
              <TBody>
                {query.data.items.map((c) => (
                  <TR key={c.id}>
                    <TD><Link href={`/admin/chargers/${c.id}`} className="font-semibold text-teal-strong hover:underline">{c.title}</Link><div className="text-xs text-slate-strong">{c.locality}, {c.city}</div>{c.isSample && <SampleBadge />}</TD>
                    <TD>{c.host.displayName}</TD>
                    <TD className="space-x-1"><StatusBadge status={c.status} />{c.isPublished ? <Badge tone="positive">Live</Badge> : <Badge>Hidden</Badge>}{c.pausedAt && <Badge tone="warning">Paused</Badge>}</TD>
                    <TD>{c.currentType} {c.maxPowerKw} kW</TD>
                    <TD><Money minor={c.unitPriceMinor} /> / {c.pricingUnit === 'PER_HOUR' ? 'h' : 'kWh'}</TD>
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
