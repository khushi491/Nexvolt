'use client';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { OpenDocument, Tabs, useAdminAction } from '@/components/admin/kit';
import { EmptyState, ErrorState, formatDate, PageHeader, ReasonDialog, StatusBadge } from '@/components/common';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { SkeletonRows } from '@/components/ui/skeleton';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { api } from '@/lib/api';
import { label } from '@/lib/utils';

type Tab = 'documents' | 'hosts' | 'chargers';

function Inner() {
  const params = useSearchParams();
  const router = useRouter();
  const tab = (params.get('tab') ?? 'documents') as Tab;
  const docs = useQuery({ queryKey: ['admin-docs'], queryFn: () => api.admin.documents({ status: 'PENDING_REVIEW', limit: 100 }) });
  const hosts = useQuery({ queryKey: ['admin-hosts', 'PENDING_REVIEW'], queryFn: () => api.admin.hosts({ status: 'PENDING_REVIEW', limit: 100 }) });
  const chargers = useQuery({ queryKey: ['admin-chargers', 'PENDING_REVIEW'], queryFn: () => api.admin.chargers({ status: 'PENDING_REVIEW', limit: 100 }) });
  const act = useAdminAction([['admin-docs'], ['admin-hosts'], ['admin-overview']], 'Decision recorded');
  const [dialog, setDialog] = useState<{ kind: 'doc' | 'kyc'; id: string; decision: string; title: string } | null>(null);

  return (
    <>
      <PageHeader title="Verification queues" description="Review identity, property and safety documents before anything is marked verified. Every decision is audit-logged with your reason." />
      <Tabs<Tab> value={tab} onChange={(t) => router.replace(`/admin/verification?tab=${t}`)} tabs={[
        { id: 'documents', label: 'Documents', count: docs.data?.total },
        { id: 'hosts', label: 'Host identity', count: hosts.data?.total },
        { id: 'chargers', label: 'Chargers', count: chargers.data?.total },
      ]} />
      <Card>
        {tab === 'documents' && (docs.isLoading ? <SkeletonRows /> : docs.isError ? <ErrorState error={docs.error} /> : !docs.data?.items.length ? <EmptyState title="No documents waiting" /> : (
          <Table>
            <THead><TR><TH>Document</TH><TH>Type</TH><TH>Host / charger</TH><TH>Uploaded</TH><TH>Decision</TH></TR></THead>
            <TBody>
              {docs.data.items.map((d) => (
                <TR key={d.id}>
                  <TD><OpenDocument id={d.id} name={d.fileName} /><div className="text-xs text-slate-strong">{(d.sizeBytes / 1024).toFixed(0)} KB · {d.mimeType}</div></TD>
                  <TD>{label(d.docType)}</TD>
                  <TD><div>{d.host?.displayName ?? '—'}</div><div className="text-xs text-slate-strong">{d.charger?.title}</div></TD>
                  <TD className="text-xs">{formatDate(d.createdAt)}</TD>
                  <TD><div className="flex gap-2">
                    <Button size="sm" onClick={() => setDialog({ kind: 'doc', id: d.id, decision: 'ACCEPTED', title: `Accept ${label(d.docType).toLowerCase()}` })}>Accept</Button>
                    <Button size="sm" variant="danger" onClick={() => setDialog({ kind: 'doc', id: d.id, decision: 'REJECTED', title: `Reject ${label(d.docType).toLowerCase()}` })}>Reject</Button>
                  </div></TD>
                </TR>
              ))}
            </TBody>
          </Table>
        ))}
        {tab === 'hosts' && (hosts.isLoading ? <SkeletonRows /> : !hosts.data?.items.length ? <EmptyState title="No hosts waiting" /> : (
          <Table>
            <THead><TR><TH>Host</TH><TH>Type</TH><TH>Status</TH><TH>Decision</TH></TR></THead>
            <TBody>
              {hosts.data.items.map((h) => (
                <TR key={h.id}>
                  <TD><Link className="font-semibold text-teal-strong hover:underline" href={`/admin/users/hosts/${h.id}`}>{h.displayName}</Link><div className="text-xs text-slate-strong">{h.userName} · {h.phoneMasked}</div></TD>
                  <TD>{label(h.hostType)}</TD>
                  <TD><StatusBadge status={h.kycStatus} /></TD>
                  <TD><div className="flex gap-2">
                    <Button size="sm" onClick={() => setDialog({ kind: 'kyc', id: h.id, decision: 'VERIFIED', title: 'Verify host identity' })}>Verify</Button>
                    <Button size="sm" variant="danger" onClick={() => setDialog({ kind: 'kyc', id: h.id, decision: 'REJECTED', title: 'Reject identity verification' })}>Reject</Button>
                  </div></TD>
                </TR>
              ))}
            </TBody>
          </Table>
        ))}
        {tab === 'chargers' && (chargers.isLoading ? <SkeletonRows /> : !chargers.data?.items.length ? <EmptyState title="No chargers waiting" /> : (
          <Table>
            <THead><TR><TH>Charger</TH><TH>Host</TH><TH>Updated</TH><TH /></TR></THead>
            <TBody>
              {chargers.data.items.map((c) => (
                <TR key={c.id}>
                  <TD><div className="font-semibold">{c.title}</div><div className="text-xs text-slate-strong">{c.locality}, {c.city}</div></TD>
                  <TD>{c.host.displayName} <StatusBadge status={c.host.kycStatus} /></TD>
                  <TD className="text-xs">{formatDate(c.updatedAt)}</TD>
                  <TD><Button size="sm" asChild><Link href={`/admin/chargers/${c.id}`}>Review</Link></Button></TD>
                </TR>
              ))}
            </TBody>
          </Table>
        ))}
      </Card>
      {dialog && (
        <ReasonDialog open onOpenChange={(v) => !v && setDialog(null)} title={dialog.title} danger={dialog.decision === 'REJECTED'} confirmLabel={label(dialog.decision)}
          description={dialog.kind === 'kyc' && dialog.decision === 'VERIFIED' ? 'Only verify after checking an accepted identity document matches this host. This is a manual review, not an automated KYC check.' : undefined}
          onConfirm={(reason) => act.mutateAsync(() => dialog.kind === 'doc' ? api.admin.reviewDocument(dialog.id, dialog.decision as 'ACCEPTED' | 'REJECTED', reason) : api.admin.decideKyc(dialog.id, dialog.decision as 'VERIFIED' | 'REJECTED', reason))} />
      )}
    </>
  );
}

export default function VerificationPage() {
  return <Suspense><Inner /></Suspense>;
}
