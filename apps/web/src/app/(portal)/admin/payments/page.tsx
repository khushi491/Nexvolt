'use client';
import { PaymentStatus, RefundStatus } from '@nexvolt/shared';
import Link from 'next/link';
import { useState } from 'react';
import { ExportButton, FilterBar, Pager, Tabs, usePaged } from '@/components/admin/kit';
import {
  DemoPaymentBadge,
  EmptyState,
  formatDate,
  Money,
  PageHeader,
  StatusBadge,
} from '@/components/common';
import { Card } from '@/components/ui/card';
import { SkeletonRows } from '@/components/ui/skeleton';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { api } from '@/lib/api';

function PaymentsTab() {
  const p = usePaged('admin-payments', api.admin.payments);
  const d = p.query.data;
  return (
    <>
      <FilterBar statuses={Object.values(PaymentStatus)} status={p.status} onStatus={p.setStatus} />
      <Card>
        {p.query.isLoading ? (
          <SkeletonRows />
        ) : !d?.items.length ? (
          <EmptyState title="No payments" />
        ) : (
          <>
            <Table>
              <THead>
                <TR>
                  <TH>Booking</TH>
                  <TH>Provider</TH>
                  <TH>Status</TH>
                  <TH>Amount</TH>
                  <TH>Refunded</TH>
                  <TH>Fee</TH>
                  <TH>Last reconciled</TH>
                </TR>
              </THead>
              <TBody>
                {d.items.map((x) => (
                  <TR key={x.id}>
                    <TD>
                      <Link
                        href={`/admin/bookings/${x.bookingId}`}
                        className="font-semibold text-teal-strong hover:underline"
                      >
                        {x.bookingCode}
                      </Link>
                      {x.isDemo && (
                        <div>
                          <DemoPaymentBadge />
                        </div>
                      )}
                    </TD>
                    <TD className="text-xs">
                      {x.provider}
                      <div className="text-slate-strong">
                        {x.providerPaymentId ?? x.providerOrderId}
                      </div>
                    </TD>
                    <TD>
                      <StatusBadge status={x.status} />
                      {x.failureReason && (
                        <div className="text-xs text-danger-strong">{x.failureReason}</div>
                      )}
                    </TD>
                    <TD>
                      <Money minor={x.amountMinor} />
                    </TD>
                    <TD>
                      <Money minor={x.amountRefundedMinor} />
                    </TD>
                    <TD>
                      {x.providerFeeMinor != null ? <Money minor={x.providerFeeMinor} /> : '—'}
                    </TD>
                    <TD className="text-xs">{formatDate(x.lastReconciledAt)}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
            <Pager offset={p.offset} limit={p.limit} total={d.total} onChange={p.setOffset} />
          </>
        )}
      </Card>
    </>
  );
}

function RefundsTab() {
  const p = usePaged('admin-refunds', api.admin.refunds);
  const d = p.query.data;
  return (
    <>
      <FilterBar statuses={Object.values(RefundStatus)} status={p.status} onStatus={p.setStatus} />
      <Card>
        {p.query.isLoading ? (
          <SkeletonRows />
        ) : !d?.items.length ? (
          <EmptyState title="No refunds" />
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>Created</TH>
                <TH>Booking</TH>
                <TH>Amount</TH>
                <TH>Status</TH>
                <TH>Reason</TH>
              </TR>
            </THead>
            <TBody>
              {d.items.map((r) => (
                <TR key={r.id}>
                  <TD className="text-xs">{formatDate(r.createdAt)}</TD>
                  <TD>
                    <Link
                      href={`/admin/bookings/${r.bookingId}`}
                      className="text-teal-strong hover:underline"
                    >
                      Open
                    </Link>
                  </TD>
                  <TD>
                    <Money minor={r.amountMinor} />
                  </TD>
                  <TD>
                    <StatusBadge status={r.status} />
                    {r.failureReason && (
                      <div className="text-xs text-danger-strong">{r.failureReason}</div>
                    )}
                  </TD>
                  <TD className="text-sm">{r.reason}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </Card>
    </>
  );
}

export default function PaymentsPage() {
  const [tab, setTab] = useState<'payments' | 'refunds'>('payments');
  return (
    <>
      <PageHeader
        title="Payments & refunds"
        description="Statuses come from server-side verification and provider reconciliation, never from the client."
        actions={<ExportButton type="payments" />}
      />
      <Tabs
        value={tab}
        onChange={setTab}
        tabs={[
          { id: 'payments', label: 'Payments' },
          { id: 'refunds', label: 'Refunds' },
        ]}
      />
      {tab === 'payments' ? <PaymentsTab /> : <RefundsTab />}
    </>
  );
}
