'use client';
import { useQuery } from '@tanstack/react-query';
import { BatteryCharging, MapPin } from 'lucide-react';
import Link from 'next/link';
import {
  ConnectorBadge,
  EmptyState,
  ErrorState,
  Money,
  PageHeader,
  SampleBadge,
  StatusBadge,
} from '@/components/common';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { SkeletonRows } from '@/components/ui/skeleton';
import { api } from '@/lib/api';

export default function ChargersPage() {
  const q = useQuery({ queryKey: ['my-chargers'], queryFn: () => api.chargers.mine() });
  return (
    <>
      <PageHeader
        title="Chargers"
        description="Listings stay hidden until Nexvolt verifies them and you publish."
        actions={
          <Button asChild>
            <Link href="/host/chargers/new">Add charger</Link>
          </Button>
        }
      />
      {q.isLoading ? (
        <SkeletonRows />
      ) : q.isError ? (
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      ) : !q.data?.length ? (
        <Card>
          <EmptyState
            icon={<BatteryCharging className="h-6 w-6" />}
            title="No chargers yet"
            description="Add your charger, upload the required documents and submit it for review."
            action={
              <Button asChild>
                <Link href="/host/chargers/new">Add your first charger</Link>
              </Button>
            }
          />
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {q.data.map((c) => (
            <Link
              key={c.id}
              href={`/host/chargers/${c.id}`}
              className="rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal"
            >
              <Card className="h-full transition-shadow hover:shadow-raised">
                <CardContent className="space-y-3 p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate font-semibold">{c.title}</p>
                      <p className="flex items-center gap-1 text-sm text-slate-strong">
                        <MapPin className="h-3.5 w-3.5" /> {c.locality}, {c.city}
                      </p>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      <StatusBadge status={c.status} />
                      {c.isPublished ? <Badge tone="positive">Live</Badge> : <Badge>Hidden</Badge>}
                      {c.pausedAt && <Badge tone="warning">Paused</Badge>}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {c.connectors.map((k) => (
                      <ConnectorBadge key={k.connectorType} type={k.connectorType} kw={k.powerKw} />
                    ))}
                    {c.isSample && <SampleBadge />}
                  </div>
                  <p className="text-sm">
                    <Money minor={c.unitPriceMinor} />{' '}
                    <span className="text-slate-strong">
                      / {c.pricingUnit === 'PER_HOUR' ? 'hour' : 'kWh'}
                    </span>{' '}
                    ·{' '}
                    <span className="text-slate-strong">
                      {c.ratingCount ? `★ ${c.ratingAvg} (${c.ratingCount})` : 'No reviews yet'}
                    </span>
                  </p>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
