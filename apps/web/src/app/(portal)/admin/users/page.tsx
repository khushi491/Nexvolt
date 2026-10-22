'use client';
import { KycStatus } from '@nexvolt/shared';
import Link from 'next/link';
import { useState } from 'react';
import { FilterBar, Pager, Tabs, useAdminAction, usePaged } from '@/components/admin/kit';
import { EmptyState, ErrorState, formatDate, PageHeader, ReasonDialog, SampleBadge, StatusBadge } from '@/components/common';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { SkeletonRows } from '@/components/ui/skeleton';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { api } from '@/lib/api';
import { useSession } from '@/lib/session';
import { label } from '@/lib/utils';

function UsersTab() {
  const p = usePaged('admin-users', api.admin.users);
  const { hasRole } = useSession();
  const act = useAdminAction([['admin-users']], 'Account updated');
  const [target, setTarget] = useState<{ id: string; suspend: boolean } | null>(null);
  const { query } = p;
  return (
    <>
      <FilterBar search={p.q} onSearch={p.setQ} statuses={['ACTIVE', 'SUSPENDED']} status={p.status} onStatus={p.setStatus} />
      <Card>
        {query.isLoading ? <SkeletonRows /> : query.isError ? <ErrorState error={query.error} /> : !query.data?.items.length ? <EmptyState title="No users match" /> : (
          <>
            <Table>
              <THead><TR><TH>User</TH><TH>Roles</TH><TH>Status</TH><TH>Bookings</TH><TH>Joined</TH><TH /></TR></THead>
              <TBody>
                {query.data.items.map((u) => (
                  <TR key={u.id}>
                    <TD><div className="font-semibold">{u.name ?? '—'}</div><div className="text-xs text-slate-strong">{u.phoneMasked}</div>{u.isSample && <SampleBadge />}{u.deletionRequestedAt && <p className="text-xs font-semibold text-warning-strong">Deletion requested {formatDate(u.deletionRequestedAt, false)}</p>}</TD>
                    <TD className="text-xs">{u.roles.map(label).join(', ')}</TD>
                    <TD><StatusBadge status={u.status} /></TD>
                    <TD>{u.bookings}</TD>
                    <TD className="text-xs">{formatDate(u.createdAt, false)}</TD>
                    <TD>{hasRole('ADMIN') && (u.status === 'ACTIVE'
                      ? <Button size="sm" variant="danger" onClick={() => setTarget({ id: u.id, suspend: true })}>Suspend</Button>
                      : <Button size="sm" variant="secondary" onClick={() => setTarget({ id: u.id, suspend: false })}>Reinstate</Button>)}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
            <Pager offset={p.offset} limit={p.limit} total={query.data.total} onChange={p.setOffset} />
          </>
        )}
      </Card>
      {target && <ReasonDialog open onOpenChange={(v) => !v && setTarget(null)} title={target.suspend ? 'Suspend account' : 'Reinstate account'} description={target.suspend ? 'Signs the user out everywhere and blocks access immediately.' : undefined} danger={target.suspend}
        onConfirm={(r) => act.mutateAsync(() => (target.suspend ? api.admin.suspendUser(target.id, r) : api.admin.reinstateUser(target.id, r)))} />}
    </>
  );
}

function HostsTab() {
  const p = usePaged('admin-hosts', api.admin.hosts);
  const { query } = p;
  return (
    <>
      <FilterBar search={p.q} onSearch={p.setQ} statuses={Object.values(KycStatus)} status={p.status} onStatus={p.setStatus} />
      <Card>
        {query.isLoading ? <SkeletonRows /> : !query.data?.items.length ? <EmptyState title="No hosts match" /> : (
          <>
            <Table>
              <THead><TR><TH>Host</TH><TH>Type</TH><TH>Identity</TH><TH>Payout account</TH><TH>Chargers</TH></TR></THead>
              <TBody>
                {query.data.items.map((h) => (
                  <TR key={h.id}>
                    <TD><Link href={`/admin/users/hosts/${h.id}`} className="font-semibold text-teal-strong hover:underline">{h.displayName}</Link><div className="text-xs text-slate-strong">{h.userName} · {h.phoneMasked}</div>{h.suspendedAt && <StatusBadge status="SUSPENDED" />}</TD>
                    <TD>{label(h.hostType)}</TD>
                    <TD><StatusBadge status={h.kycStatus} /></TD>
                    <TD><StatusBadge status={h.payoutAccountStatus} /></TD>
                    <TD>{h.chargerCount}</TD>
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

export default function UsersPage() {
  const [tab, setTab] = useState<'users' | 'hosts'>('users');
  return (
    <>
      <PageHeader title="Users & hosts" description="Phone numbers are masked in lists. Suspensions take effect immediately and are audit-logged." />
      <Tabs value={tab} onChange={setTab} tabs={[{ id: 'users', label: 'All users' }, { id: 'hosts', label: 'Hosts' }]} />
      {tab === 'users' ? <UsersTab /> : <HostsTab />}
    </>
  );
}
