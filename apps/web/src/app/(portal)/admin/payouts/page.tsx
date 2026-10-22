'use client';
import { PayoutStatus } from '@nexvolt/shared';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { ExportButton, FilterBar, useAdminAction } from '@/components/admin/kit';
import { EmptyState, formatDate, Money, PageHeader, ReasonDialog, StatusBadge } from '@/components/common';
import { Button } from '@/components/ui/button';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Field, Input } from '@/components/ui/input';
import { SkeletonRows } from '@/components/ui/skeleton';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { api } from '@/lib/api';

export default function PayoutsPage() {
  const [status, setStatus] = useState('');
  const eligible = useQuery({ queryKey: ['admin-eligible'], queryFn: () => api.admin.eligiblePayouts() });
  const payouts = useQuery({ queryKey: ['admin-payouts', status], queryFn: () => api.admin.payouts({ status: status || undefined }) });
  const act = useAdminAction([['admin-eligible'], ['admin-payouts']], 'Payout updated');
  const [dialog, setDialog] = useState<{ kind: 'create' | 'paid' | 'failed'; id: string } | null>(null);
  const [ref, setRef] = useState('');
  return (
    <>
      <PageHeader title="Payouts" description="Creating a payout batches eligible earnings; it does NOT move money. Transfer through your bank or a supported provider, then record the reference to mark it paid." actions={<ExportButton type="payouts" />} />
      <Card>
        <CardHeader><CardTitle>Eligible balances</CardTitle><CardDescription>Earnings past the dispute window, not yet in a payout.</CardDescription></CardHeader>
        {eligible.isLoading ? <SkeletonRows rows={2} /> : !eligible.data?.length ? <EmptyState title="Nothing eligible right now" /> : (
          <Table>
            <THead><TR><TH>Host</TH><TH>Payout account</TH><TH>Entries</TH><TH>Eligible</TH><TH /></TR></THead>
            <TBody>{eligible.data.map((e) => (
              <TR key={e.hostId}>
                <TD className="font-semibold">{e.hostDisplayName}</TD>
                <TD><StatusBadge status={e.payoutAccountStatus} /></TD>
                <TD>{e.entryCount}</TD>
                <TD><Money minor={e.eligibleMinor} className="font-semibold" /></TD>
                <TD><Button size="sm" disabled={e.payoutAccountStatus !== 'ACTIVE'} title={e.payoutAccountStatus !== 'ACTIVE' ? 'Payout account not verified' : undefined} onClick={() => setDialog({ kind: 'create', id: e.hostId })}>Create payout</Button></TD>
              </TR>
            ))}</TBody>
          </Table>
        )}
      </Card>
      <div className="mt-6"><FilterBar statuses={Object.values(PayoutStatus)} status={status} onStatus={setStatus} /></div>
      <Card>
        {payouts.isLoading ? <SkeletonRows /> : !payouts.data?.length ? <EmptyState title="No payouts" /> : (
          <Table>
            <THead><TR><TH>Created</TH><TH>Host</TH><TH>Amount</TH><TH>Status</TH><TH>Reference</TH><TH /></TR></THead>
            <TBody>{payouts.data.map((p) => (
              <TR key={p.id}>
                <TD className="text-xs">{formatDate(p.createdAt)}</TD>
                <TD>{p.hostDisplayName}<div className="text-xs text-slate-strong">{p.entryCount} entries</div></TD>
                <TD><Money minor={p.amountMinor} /></TD>
                <TD><StatusBadge status={p.status} />{p.failureReason && <div className="text-xs text-danger-strong">{p.failureReason}</div>}</TD>
                <TD className="text-xs">{p.externalReference ?? '—'}{p.confirmedAt && <div className="text-slate-strong">{formatDate(p.confirmedAt)}</div>}</TD>
                <TD>{(p.status === 'READY_FOR_PAYOUT' || p.status === 'PROCESSING') && (
                  <div className="flex gap-2"><Button size="sm" onClick={() => setDialog({ kind: 'paid', id: p.id })}>Mark paid</Button><Button size="sm" variant="danger" onClick={() => setDialog({ kind: 'failed', id: p.id })}>Failed</Button></div>
                )}</TD>
              </TR>
            ))}</TBody>
          </Table>
        )}
      </Card>
      {dialog && (
        <ReasonDialog open onOpenChange={(v) => { if (!v) { setDialog(null); setRef(''); } }}
          title={{ create: 'Create payout batch', paid: 'Mark payout as paid', failed: 'Mark payout as failed' }[dialog.kind]}
          description={dialog.kind === 'paid' ? 'Only after the transfer is confirmed by your bank or provider.' : dialog.kind === 'failed' ? 'Entries return to the eligible pool.' : undefined}
          danger={dialog.kind === 'failed'}
          extra={dialog.kind === 'paid' ? <Field label="Bank UTR / provider payout ID" htmlFor="utr"><Input id="utr" value={ref} onChange={(e) => setRef(e.target.value)} minLength={6} required /></Field> : undefined}
          onConfirm={(reason) => act.mutateAsync(() => dialog.kind === 'create' ? api.admin.createPayout(dialog.id, reason) : dialog.kind === 'paid' ? api.admin.markPayoutPaid(dialog.id, ref, reason) : api.admin.markPayoutFailed(dialog.id, reason))} />
      )}
    </>
  );
}
