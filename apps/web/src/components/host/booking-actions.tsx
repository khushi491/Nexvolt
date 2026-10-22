'use client';
import type { BookingDto } from '@nexvolt/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { BookingStatusBadge, DemoPaymentBadge, EmptyState, Money, SampleBadge } from '@/components/common';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Field, Input, Textarea } from '@/components/ui/input';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { useToast } from '@/components/ui/toast';
import { api, errorMessage } from '@/lib/api';
import { istDay, istTime } from '@/lib/time';

function useAct() {
  const qc = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: async (fn: () => Promise<unknown>) => fn(),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['host-bookings'] });
      void qc.invalidateQueries({ queryKey: ['host-earnings'] });
    },
    onError: (e) => toast({ tone: 'error', message: errorMessage(e) }),
  });
}

/** Host-side meter reading entry. Readings are immutable once saved; corrections go through support. */
function MeterDialog({ booking, phase, onClose }: { booking: BookingDto; phase: 'start' | 'end'; onClose: () => void }) {
  const [reading, setReading] = useState('');
  const act = useAct();
  const toast = useToast();
  const required = booking.pricing.pricingUnit === 'PER_KWH';
  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent title={phase === 'start' ? 'Confirm session start' : 'Confirm session end'} description="Read the value shown on the meter. Nexvolt cannot read your charger remotely; the driver records their own reading and both are compared.">
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            act.mutate(() => (phase === 'start' ? api.sessions.start : api.sessions.end)(booking.id, reading ? { readingKwh: reading } : {}), {
              onSuccess: () => {
                toast({ tone: 'success', message: phase === 'start' ? 'Start confirmed' : 'End confirmed' });
                onClose();
              },
            });
          }}
        >
          <Field label={`Meter reading (kWh)${required ? '' : ' — optional for hourly bookings'}`} htmlFor="reading" hint="Up to 3 decimals, e.g. 1234.567">
            <Input id="reading" inputMode="decimal" value={reading} onChange={(e) => setReading(e.target.value)} pattern="^\d{1,9}(\.\d{1,3})?$" required={required} />
          </Field>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
            <Button type="submit" loading={act.isPending}>Confirm</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ReasonAction({ title, label, danger, onSubmit }: { title: string; label: string; danger?: boolean; onSubmit: (reason: string) => Promise<unknown> }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const act = useAct();
  return (
    <>
      <Button size="sm" variant={danger ? 'danger' : 'secondary'} onClick={() => setOpen(true)}>{label}</Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent title={title}>
          <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); act.mutate(() => onSubmit(reason), { onSuccess: () => setOpen(false) }); }}>
            <Field label="Reason (shared with the driver)" htmlFor="r"><Textarea id="r" value={reason} onChange={(e) => setReason(e.target.value)} minLength={3} required /></Field>
            <div className="flex justify-end gap-2"><Button type="button" variant="secondary" onClick={() => setOpen(false)}>Back</Button><Button type="submit" variant={danger ? 'danger' : 'primary'} loading={act.isPending}>{label}</Button></div>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function HostBookingActions({ b }: { b: BookingDto }) {
  const act = useAct();
  const [meter, setMeter] = useState<'start' | 'end' | null>(null);
  const s = b.session;
  const now = Date.now();
  return (
    <div className="flex flex-wrap gap-2">
      {b.status === 'AWAITING_HOST_APPROVAL' && (
        <>
          <Button size="sm" onClick={() => act.mutate(() => api.bookings.approve(b.id))} loading={act.isPending}>Approve</Button>
          <ReasonAction title="Decline request" label="Decline" danger onSubmit={(r) => api.bookings.decline(b.id, r)} />
        </>
      )}
      {b.status === 'CONFIRMED' && now > new Date(b.startAt).getTime() - 15 * 60_000 && (
        <Button size="sm" onClick={() => act.mutate(() => api.bookings.checkIn(b.id))}>Check in driver</Button>
      )}
      {b.status === 'CONFIRMED' && now > new Date(b.startAt).getTime() + 30 * 60_000 && (
        <Button size="sm" variant="secondary" onClick={() => act.mutate(() => api.bookings.noShow(b.id))}>Mark no-show</Button>
      )}
      {(b.status === 'CHECKED_IN' || b.status === 'CHARGING') && !s?.hostStartConfirmedAt && <Button size="sm" onClick={() => setMeter('start')}>Confirm start</Button>}
      {b.status === 'CHARGING' && s?.hostStartConfirmedAt && !s.hostEndConfirmedAt && <Button size="sm" onClick={() => setMeter('end')}>Confirm end</Button>}
      {b.canCancel && b.status !== 'AWAITING_HOST_APPROVAL' && (
        <ReasonAction title="Cancel booking" label="Cancel" danger onSubmit={(r) => api.bookings.cancel(b.id, r)} />
      )}
      {meter && <MeterDialog booking={b} phase={meter} onClose={() => setMeter(null)} />}
    </div>
  );
}

export function HostBookingsTable({ bookings, emptyTitle = 'No bookings yet' }: { bookings: BookingDto[]; emptyTitle?: string }) {
  if (!bookings.length) return <EmptyState title={emptyTitle} description="Bookings appear here once drivers reserve your verified, published chargers." />;
  return (
    <Table>
      <THead><TR><TH>Booking</TH><TH>When (IST)</TH><TH>Driver</TH><TH>Status</TH><TH>Your earnings*</TH><TH>Actions</TH></TR></THead>
      <TBody>
        {bookings.map((b) => (
          <TR key={b.id}>
            <TD>
              <div className="font-semibold">{b.code}</div>
              <div className="text-xs text-slate-strong">{b.charger.title}</div>
              <div className="mt-1 flex gap-1">{b.charger.isSample && <SampleBadge />}{b.payment?.isDemo && <DemoPaymentBadge />}</div>
            </TD>
            <TD><div>{istDay(b.startAt)}</div><div className="text-xs text-slate-strong">{istTime(b.startAt)} – {istTime(b.endAt)}</div></TD>
            <TD><div>{b.driver?.name ?? '—'}</div><div className="text-xs text-slate-strong">{b.driver?.phoneMasked} · {b.vehicle.label}</div></TD>
            <TD><BookingStatusBadge status={b.status} />{b.session?.meteredEnergyWh != null && <div className="mt-1 text-xs text-slate-strong">{(b.session.meteredEnergyWh / 1000).toFixed(2)} kWh verified</div>}</TD>
            <TD>{b.hostView ? <Money minor={b.hostView.hostEarningsBeforeGatewayFeesMinor} /> : '—'}</TD>
            <TD><HostBookingActions b={b} /></TD>
          </TR>
        ))}
      </TBody>
    </Table>
  );
}
