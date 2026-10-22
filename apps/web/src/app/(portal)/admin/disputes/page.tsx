'use client';
import { DisputeStatus, rupeesToPaise } from '@nexvolt/shared';
import Link from 'next/link';
import { useState } from 'react';
import { FilterBar, usePaged, useAdminAction } from '@/components/admin/kit';
import { EmptyState, formatDate, PageHeader, StatusBadge } from '@/components/common';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Field, Input, Select, Textarea } from '@/components/ui/input';
import { SkeletonRows } from '@/components/ui/skeleton';
import { api, errorMessage } from '@/lib/api';
import { useSession } from '@/lib/session';
import { label } from '@/lib/utils';

type Outcome = 'RESOLVED_DRIVER_FAVOUR' | 'RESOLVED_HOST_FAVOUR' | 'RESOLVED_SPLIT';

function ResolveDialog({ id, onClose }: { id: string; onClose: () => void }) {
  const act = useAdminAction([['admin-disputes'], ['admin-overview']], 'Dispute resolved');
  const [outcome, setOutcome] = useState<Outcome>('RESOLVED_SPLIT');
  const [refund, setRefund] = useState('');
  const [kwh, setKwh] = useState('');
  const [notes, setNotes] = useState('');
  const [err, setErr] = useState<string | null>(null);
  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent title="Resolve dispute" description="Driver favour cancels the booking with a full refund. Host favour / split complete the booking; earnings then settle after the dispute window.">
        <form className="space-y-4" onSubmit={async (e) => {
          e.preventDefault();
          setErr(null);
          try {
            await act.mutateAsync(() => api.admin.resolveDispute(id, {
              outcome,
              notes,
              refundAmountMinor: outcome === 'RESOLVED_SPLIT' && refund ? rupeesToPaise(refund) : undefined,
              billableEnergyWh: kwh ? Math.round(Number(kwh) * 1000) : undefined,
            }));
            onClose();
          } catch (x) { setErr(errorMessage(x)); }
        }}>
          <Field label="Outcome" htmlFor="oc"><Select id="oc" value={outcome} onChange={(e) => setOutcome(e.target.value as Outcome)}>
            <option value="RESOLVED_DRIVER_FAVOUR">Driver’s favour — cancel + full refund</option>
            <option value="RESOLVED_SPLIT">Split — partial refund</option>
            <option value="RESOLVED_HOST_FAVOUR">Host’s favour — charge stands</option>
          </Select></Field>
          {outcome === 'RESOLVED_SPLIT' && <Field label="Refund to driver (₹)" htmlFor="rf"><Input id="rf" inputMode="decimal" value={refund} onChange={(e) => setRefund(e.target.value)} /></Field>}
          {outcome !== 'RESOLVED_DRIVER_FAVOUR' && <Field label="Reconciled energy (kWh, optional)" htmlFor="kw" hint="For per-kWh bookings the charge is recalculated from this value; unused prepayment is refunded."><Input id="kw" inputMode="decimal" value={kwh} onChange={(e) => setKwh(e.target.value)} /></Field>}
          <Field label="Resolution notes (shared summary + audit log)" htmlFor="nt" error={err ?? undefined}><Textarea id="nt" value={notes} onChange={(e) => setNotes(e.target.value)} minLength={5} required /></Field>
          <div className="flex justify-end gap-2"><Button type="button" variant="secondary" onClick={onClose}>Cancel</Button><Button type="submit" loading={act.isPending} disabled={notes.trim().length < 5}>Resolve</Button></div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default function DisputesPage() {
  const p = usePaged('admin-disputes', api.admin.disputes);
  const { hasRole } = useSession();
  const review = useAdminAction([['admin-disputes']], 'Marked under review');
  const [resolving, setResolving] = useState<string | null>(null);
  const d = p.query.data;
  return (
    <>
      <PageHeader title="Disputes" description="Meter discrepancies open automatically. Payouts for disputed bookings are held until resolved." />
      <FilterBar statuses={Object.values(DisputeStatus)} status={p.status} onStatus={p.setStatus} />
      {p.query.isLoading ? <SkeletonRows /> : !d?.items.length ? <Card><EmptyState title="No disputes" description="Open and under-review disputes appear here by default." /></Card> : (
        <div className="space-y-4">
          {d.items.map((x) => (
            <Card key={x.id}>
              <CardContent className="space-y-3 p-5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2"><Link href={`/admin/bookings/${x.bookingId}`} className="font-semibold text-teal-strong hover:underline">{x.bookingCode}</Link><StatusBadge status={x.status} /><span className="text-sm">{label(x.reason)}</span><span className="text-xs text-slate-strong">raised by {label(x.raisedByRole)} · {formatDate(x.createdAt)}</span></div>
                  {['OPEN', 'UNDER_REVIEW'].includes(x.status) && (
                    <div className="flex gap-2">
                      {x.status === 'OPEN' && <Button size="sm" variant="secondary" onClick={() => review.mutate(() => api.admin.reviewDispute(x.id))}>Start review</Button>}
                      {hasRole('ADMIN') && <Button size="sm" onClick={() => setResolving(x.id)}>Resolve</Button>}
                    </div>
                  )}
                </div>
                <p className="text-sm">{x.description}</p>
                {x.assessment && (
                  <div className="grid gap-2 rounded-md bg-background p-3 text-xs sm:grid-cols-4">
                    <p><span className="text-slate-strong">Assessment:</span> {label(x.assessment.status)}</p>
                    <p><span className="text-slate-strong">Host energy:</span> {x.assessment.hostEnergyWh != null ? `${(x.assessment.hostEnergyWh / 1000).toFixed(3)} kWh` : '—'}</p>
                    <p><span className="text-slate-strong">Driver energy:</span> {x.assessment.driverEnergyWh != null ? `${(x.assessment.driverEnergyWh / 1000).toFixed(3)} kWh` : '—'}</p>
                    <p><span className="text-slate-strong">Max plausible:</span> {(x.assessment.maxPlausibleWh / 1000).toFixed(2)} kWh</p>
                  </div>
                )}
                {x.resolutionNotes && <p className="text-sm text-slate-strong">Resolution: {x.resolutionNotes}</p>}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
      {resolving && <ResolveDialog id={resolving} onClose={() => setResolving(null)} />}
    </>
  );
}
