'use client';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { OpenDocument, useAdminAction } from '@/components/admin/kit';
import { ErrorState, formatDate, PageHeader, ReasonDialog, StatusBadge } from '@/components/common';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { SkeletonRows } from '@/components/ui/skeleton';
import { api } from '@/lib/api';
import { label } from '@/lib/utils';

type Action = 'VERIFY' | 'REJECT' | 'PAYOUT_ACTIVE' | 'PAYOUT_REJECTED' | 'SUSPEND' | 'REINSTATE';

export default function AdminHostDetail() {
  const { id } = useParams<{ id: string }>();
  const q = useQuery({ queryKey: ['admin-host', id], queryFn: () => api.admin.host(id) });
  const act = useAdminAction([['admin-host', id], ['admin-hosts']], 'Host updated');
  const [action, setAction] = useState<Action | null>(null);
  if (q.isLoading) return <SkeletonRows rows={6} />;
  if (q.isError || !q.data) return <ErrorState error={q.error} />;
  const h = q.data;
  const run = (reason: string) => act.mutateAsync(() => {
    switch (action) {
      case 'VERIFY': return api.admin.decideKyc(id, 'VERIFIED', reason);
      case 'REJECT': return api.admin.decideKyc(id, 'REJECTED', reason);
      case 'PAYOUT_ACTIVE': return api.admin.setPayoutAccount(id, 'ACTIVE', reason);
      case 'PAYOUT_REJECTED': return api.admin.setPayoutAccount(id, 'REJECTED', reason);
      case 'SUSPEND': return api.admin.suspendHost(id, reason);
      default: return api.admin.reinstateHost(id, reason);
    }
  });
  return (
    <div className="max-w-5xl">
      <PageHeader title={h.displayName} description={`${label(h.hostType)} · ${h.userName ?? ''} · ${h.phone} · host since ${formatDate(h.createdAt, false)}`}
        actions={h.suspendedAt ? <Button variant="secondary" onClick={() => setAction('REINSTATE')}>Reinstate host</Button> : <Button variant="danger" onClick={() => setAction('SUSPEND')}>Suspend host</Button>} />
      {h.suspendedAt && <p className="mb-4 rounded-md border border-danger bg-danger-soft p-3 text-sm text-danger-strong">Suspended {formatDate(h.suspendedAt)}: {h.suspensionReason}</p>}
      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Identity</CardTitle></CardHeader>
          <CardContent className="space-y-3 text-sm">
            <p>Status: <StatusBadge status={h.kycStatus} /></p>
            <ul className="space-y-1">{h.documents.filter((d) => d.docType === 'IDENTITY_PROOF').map((d) => <li key={d.id} className="flex items-center gap-2"><OpenDocument id={d.id} name={d.fileName} /><StatusBadge status={d.status} /></li>)}</ul>
            <div className="flex gap-2"><Button size="sm" onClick={() => setAction('VERIFY')}>Verify identity</Button><Button size="sm" variant="danger" onClick={() => setAction('REJECT')}>Reject</Button></div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Payout account</CardTitle></CardHeader>
          <CardContent className="space-y-3 text-sm">
            <p>Status: <StatusBadge status={h.payoutAccountStatus} /></p>
            <p className="text-slate-strong">Mark active only after verifying the host’s bank account through an approved offline process (e.g. penny-drop via your bank). Nexvolt stores no bank details.</p>
            <div className="flex gap-2"><Button size="sm" onClick={() => setAction('PAYOUT_ACTIVE')}>Mark active</Button><Button size="sm" variant="danger" onClick={() => setAction('PAYOUT_REJECTED')}>Reject</Button></div>
          </CardContent>
        </Card>
        <Card className="md:col-span-2">
          <CardHeader><CardTitle>Chargers</CardTitle></CardHeader>
          <CardContent><ul className="divide-y divide-line text-sm">{h.chargers.map((c) => <li key={c.id} className="flex items-center justify-between py-2"><Link className="text-teal-strong hover:underline" href={`/admin/chargers/${c.id}`}>{c.title}</Link><span className="space-x-1"><StatusBadge status={c.status} /> {c.isPublished && <StatusBadge status="ACTIVE" />}</span></li>)}</ul></CardContent>
        </Card>
      </div>
      {action && <ReasonDialog open onOpenChange={(v) => !v && setAction(null)} title={label(action)} danger={['REJECT', 'PAYOUT_REJECTED', 'SUSPEND'].includes(action)} onConfirm={run}
        description={action === 'SUSPEND' ? 'Unpublishes all of this host’s chargers and holds payouts.' : undefined} />}
    </div>
  );
}
