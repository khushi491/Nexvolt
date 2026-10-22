'use client';
import { useQuery } from '@tanstack/react-query';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { newIdempotencyKey } from '@nexvolt/api-client';
import { rupeesToPaise } from '@nexvolt/shared';
import { useAdminAction } from '@/components/admin/kit';
import {
  BookingStatusBadge,
  DemoPaymentBadge,
  ErrorState,
  formatDate,
  Money,
  PageHeader,
  PriceBreakdown,
  ReasonDialog,
  StatusBadge,
} from '@/components/common';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Field, Input } from '@/components/ui/input';
import { SkeletonRows } from '@/components/ui/skeleton';
import { api } from '@/lib/api';
import { useSession } from '@/lib/session';
import { istDay, istTime } from '@/lib/time';
import { label } from '@/lib/utils';

export default function AdminBookingDetail() {
  const { id } = useParams<{ id: string }>();
  const { hasRole } = useSession();
  const q = useQuery({ queryKey: ['admin-booking', id], queryFn: () => api.admin.booking(id) });
  const act = useAdminAction([['admin-booking', id], ['admin-bookings']], 'Done');
  const [dialog, setDialog] = useState<'cancel' | 'refund' | null>(null);
  const [amount, setAmount] = useState('');
  const [idemKey] = useState(() => newIdempotencyKey());
  if (q.isLoading) return <SkeletonRows rows={8} />;
  if (q.isError || !q.data) return <ErrorState error={q.error} />;
  const { booking: b, events, payments, refunds, disputes, ledger } = q.data;
  const s = b.session;
  return (
    <div className="max-w-6xl">
      <PageHeader
        title={`Booking ${b.code}`}
        description={`${b.charger.title} · ${istDay(b.startAt)} ${istTime(b.startAt)}–${istTime(b.endAt)} IST`}
        actions={
          <>
            <BookingStatusBadge status={b.status} />
            {b.payment?.isDemo && <DemoPaymentBadge />}
            {hasRole('ADMIN') && (
              <>
                <Button variant="secondary" onClick={() => setDialog('refund')}>
                  Partial refund
                </Button>
                {!['CANCELLED', 'SETTLED', 'EXPIRED', 'FAILED'].includes(b.status) && (
                  <Button variant="danger" onClick={() => setDialog('cancel')}>
                    Cancel with full refund
                  </Button>
                )}
              </>
            )}
          </>
        }
      />
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>Timeline</CardTitle>
            </CardHeader>
            <CardContent>
              <ol className="relative space-y-3 border-l border-line pl-5">
                {events.map((e) => (
                  <li key={e.id} className="text-sm">
                    <span
                      className="absolute -left-[5px] mt-1.5 h-2.5 w-2.5 rounded-full bg-teal"
                      aria-hidden
                    />
                    <span className="font-semibold">
                      {e.fromStatus ? `${label(e.fromStatus)} → ` : ''}
                      {label(e.toStatus)}
                    </span>{' '}
                    <span className="text-xs text-slate-strong">
                      by {label(e.actorType)} · {formatDate(e.createdAt)}
                    </span>
                    {e.reason && <p className="text-slate-strong">{e.reason}</p>}
                  </li>
                ))}
              </ol>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Payments & provider events</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-sm">
              {payments.length === 0 && <p className="text-slate-strong">No payment attempts.</p>}
              {payments.map((p) => (
                <div key={p.id} className="rounded-md border border-line p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusBadge status={p.status} />
                    {p.isDemo && <DemoPaymentBadge />}
                    <Money minor={p.amountMinor} className="font-semibold" />{' '}
                    <span className="text-xs text-slate-strong">
                      {p.provider} · order {p.providerOrderId}
                      {p.providerPaymentId && ` · ${p.providerPaymentId}`}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-slate-strong">
                    Refunded <Money minor={p.amountRefundedMinor} /> · fee{' '}
                    {p.providerFeeMinor != null ? <Money minor={p.providerFeeMinor} /> : '—'} ·{' '}
                    {p.failureReason ?? ''}
                  </p>
                  {p.events.length > 0 && (
                    <ul className="mt-2 space-y-1 text-xs">
                      {p.events.map((e, i) => (
                        <li key={i}>
                          {e.eventType} · received {formatDate(e.receivedAt)} ·{' '}
                          {e.processedAt ? (
                            'processed'
                          ) : (
                            <span className="text-danger-strong">
                              {e.processingError ?? 'pending'}
                            </span>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ))}
              {refunds.length > 0 && (
                <div>
                  <p className="mb-1 font-semibold">Refunds</p>
                  {refunds.map((r) => (
                    <p key={r.id}>
                      <StatusBadge status={r.status} /> <Money minor={r.amountMinor} /> — {r.reason}
                    </p>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Host ledger postings</CardTitle>
            </CardHeader>
            <CardContent className="text-sm">
              {ledger.length === 0 ? (
                <p className="text-slate-strong">None.</p>
              ) : (
                ledger.map((l, i) => (
                  <p
                    key={i}
                    className="flex justify-between border-b border-line py-1 last:border-0"
                  >
                    <span>
                      {label(l.type)} <StatusBadge status={l.status} />
                    </span>
                    <Money minor={l.amountMinor} />
                  </p>
                ))
              )}
            </CardContent>
          </Card>
        </div>
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Price</CardTitle>
            </CardHeader>
            <CardContent>
              <PriceBreakdown
                items={b.pricing.lineItems}
                total={b.pricing.totalMinor}
                isEstimate={b.pricing.isEstimate}
              />
              {b.hostView && (
                <p className="mt-3 text-xs text-slate-strong">
                  Commission {b.hostView.commissionBps / 100}% ={' '}
                  <Money minor={b.hostView.commissionMinor} />
                </p>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Session</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1 text-sm">
              {!s ? (
                <p className="text-slate-strong">Not started.</p>
              ) : (
                <>
                  <p>
                    Status: <StatusBadge status={s.status} />
                  </p>
                  <p>Duration: {s.durationMinutes ?? '—'} min</p>
                  <p>
                    Estimated energy: {(s.estimatedEnergyWh / 1000).toFixed(2)} kWh{' '}
                    <span className="text-xs text-slate-strong">(estimate)</span>
                  </p>
                  <p>
                    Verified energy:{' '}
                    {s.meteredEnergyWh != null
                      ? `${(s.meteredEnergyWh / 1000).toFixed(3)} kWh`
                      : '—'}
                  </p>
                  <ul className="mt-2 text-xs">
                    {s.readings.map((r) => (
                      <li key={r.id}>
                        {label(r.phase)} · {label(r.recordedByRole)}: {r.readingKwh} kWh
                        {r.hasEvidence ? ' 📷' : ''}
                      </li>
                    ))}
                  </ul>
                  {s.assessment && (
                    <p className="mt-2 rounded-md bg-background p-2 text-xs">
                      {label(s.assessment.status)}: {s.assessment.message}
                    </p>
                  )}
                </>
              )}
            </CardContent>
          </Card>
          {disputes.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Disputes</CardTitle>
              </CardHeader>
              <CardContent className="text-sm">
                {disputes.map((d) => (
                  <p key={d.id}>
                    <StatusBadge status={d.status} /> {label(d.reason)} — {d.description}
                  </p>
                ))}
              </CardContent>
            </Card>
          )}
        </div>
      </div>
      {dialog === 'cancel' && (
        <ReasonDialog
          open
          onOpenChange={(v) => !v && setDialog(null)}
          title="Cancel booking with full refund"
          description="Use for unsafe chargers, host fault or platform errors. Both parties are notified."
          danger
          confirmLabel="Cancel booking"
          onConfirm={(r) => act.mutateAsync(() => api.admin.cancelBooking(id, r))}
        />
      )}
      {dialog === 'refund' && (
        <ReasonDialog
          open
          onOpenChange={(v) => !v && setDialog(null)}
          title="Issue partial refund"
          confirmLabel="Refund"
          extra={
            <Field label="Amount (₹)" htmlFor="amt">
              <Input
                id="amt"
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                required
              />
            </Field>
          }
          onConfirm={(r) =>
            act.mutateAsync(() =>
              api.admin.refund(
                { bookingId: id, amountMinor: rupeesToPaise(amount), reason: r },
                idemKey,
              ),
            )
          }
        />
      )}
    </div>
  );
}
