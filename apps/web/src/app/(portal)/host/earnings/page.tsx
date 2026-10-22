'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Info } from 'lucide-react';
import {
  EmptyState,
  ErrorState,
  formatDate,
  Money,
  PageHeader,
  StatsCard,
  StatusBadge,
} from '@/components/common';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { SkeletonRows } from '@/components/ui/skeleton';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { useToast } from '@/components/ui/toast';
import { api, errorMessage } from '@/lib/api';
import { label } from '@/lib/utils';

export default function EarningsPage() {
  const toast = useToast();
  const qc = useQueryClient();
  const summary = useQuery({ queryKey: ['host-earnings'], queryFn: () => api.hosts.earnings() });
  const ledger = useQuery({ queryKey: ['host-ledger'], queryFn: () => api.hosts.ledger(200) });
  const payouts = useQuery({ queryKey: ['host-payouts'], queryFn: () => api.hosts.payouts() });
  const onboarding = useMutation({
    mutationFn: () => api.hosts.payoutOnboarding(),
    onSuccess: (r) => {
      toast({ tone: 'success', message: r.message });
      void qc.invalidateQueries({ queryKey: ['host-earnings'] });
    },
    onError: (e) => toast({ tone: 'error', message: errorMessage(e) }),
  });
  const s = summary.data;
  return (
    <>
      <PageHeader
        title="Earnings"
        description="An itemised ledger of what you’ve earned. Amounts are owed to you once eligible; they are paid only when a payout is confirmed."
      />
      {summary.isError ? (
        <ErrorState error={summary.error} />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatsCard
              label="Gross charging fees"
              value={s ? <Money minor={s.grossMinor} /> : '…'}
            />
            <StatsCard
              label="Nexvolt commission"
              value={s ? <Money minor={s.commissionMinor} /> : '…'}
              hint="Net of commission returned on refunds"
            />
            <StatsCard
              label="Payment fees"
              value={s ? <Money minor={s.paymentFeesMinor} /> : '…'}
              hint="Gateway charges reported by the provider"
            />
            <StatsCard label="Refunds" value={s ? <Money minor={s.refundsMinor} /> : '…'} />
          </div>
          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatsCard
              label="Pending"
              value={s ? <Money minor={s.pendingMinor} /> : '…'}
              hint="Until session completes + dispute window"
            />
            <StatsCard
              label="Eligible for payout"
              value={s ? <Money minor={s.eligibleMinor} /> : '…'}
              hint="Owed — not yet transferred"
            />
            <StatsCard
              label="In a payout batch"
              value={s ? <Money minor={s.inPayoutMinor} /> : '…'}
              hint="Awaiting bank confirmation"
              tone={s?.inPayoutMinor ? 'warning' : 'default'}
            />
            <StatsCard
              label="Paid out"
              value={s ? <Money minor={s.paidOutMinor} /> : '…'}
              hint="Confirmed with a bank reference"
            />
          </div>
        </>
      )}
      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Payout account</CardTitle>
          <CardDescription>
            Automated split settlement (e.g. Razorpay Route) requires separate onboarding and is not
            enabled. Payouts are made by the Nexvolt team by bank transfer after verifying your
            details through a secure channel.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-3">
          {s && <StatusBadge status={s.payoutAccountStatus} />}
          {s && s.payoutAccountStatus !== 'ACTIVE' && (
            <Button
              variant="secondary"
              onClick={() => onboarding.mutate()}
              loading={onboarding.isPending}
            >
              Request payout setup
            </Button>
          )}
          <p className="flex items-center gap-1 text-xs text-slate-strong">
            <Info className="h-3.5 w-3.5" /> Nexvolt never asks for bank passwords or OTPs.
          </p>
        </CardContent>
      </Card>
      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Ledger</CardTitle>
          </CardHeader>
          {ledger.isLoading ? (
            <SkeletonRows />
          ) : !ledger.data?.length ? (
            <EmptyState title="No ledger entries yet" />
          ) : (
            <Table>
              <THead>
                <TR>
                  <TH>Date</TH>
                  <TH>Entry</TH>
                  <TH>Status</TH>
                  <TH className="text-right">Amount</TH>
                </TR>
              </THead>
              <TBody>
                {ledger.data.map((e) => (
                  <TR key={e.id}>
                    <TD className="whitespace-nowrap text-xs">{formatDate(e.createdAt)}</TD>
                    <TD>
                      <div>{label(e.type)}</div>
                      <div className="text-xs text-slate-strong">{e.bookingCode}</div>
                    </TD>
                    <TD>
                      <StatusBadge status={e.status} />
                    </TD>
                    <TD
                      className={`text-right font-semibold ${e.amountMinor < 0 ? 'text-danger-strong' : 'text-positive-strong'}`}
                    >
                      <Money minor={e.amountMinor} />
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Payouts</CardTitle>
          </CardHeader>
          <CardContent>
            {!payouts.data?.length ? (
              <p className="text-sm text-slate-strong">No payouts yet.</p>
            ) : (
              <ul className="space-y-3">
                {payouts.data.map((p) => (
                  <li key={p.id} className="rounded-md bg-background p-3 text-sm">
                    <div className="flex items-center justify-between">
                      <Money minor={p.amountMinor} className="font-semibold" />
                      <StatusBadge status={p.status} />
                    </div>
                    <p className="mt-1 text-xs text-slate-strong">
                      {formatDate(p.createdAt)}
                      {p.externalReference && ` · Ref ${p.externalReference}`}
                    </p>
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
