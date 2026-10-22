'use client';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { FilterBar, Json } from '@/components/admin/kit';
import { EmptyState, ErrorState, formatDate, PageHeader } from '@/components/common';
import { Card } from '@/components/ui/card';
import { SkeletonRows } from '@/components/ui/skeleton';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { api } from '@/lib/api';

const TYPES = [
  'Booking',
  'Charger',
  'HostProfile',
  'User',
  'VerificationDocument',
  'Payout',
  'PlatformSetting',
  'Dispute',
  'SupportTicket',
  'IncidentReport',
  'Review',
  'VehicleModel',
  'Export',
  'Maintenance',
];

export default function AuditPage() {
  const [type, setType] = useState('');
  const q = useQuery({
    queryKey: ['admin-audit', type],
    queryFn: () => api.admin.auditLogs({ resourceType: type || undefined, limit: 200 }),
  });
  return (
    <>
      <PageHeader
        title="Audit log"
        description="Append-only (enforced by the database). Shows who did what, when, why, and what changed."
      />
      <FilterBar statuses={TYPES} status={type} onStatus={setType} />
      <Card>
        {q.isLoading ? (
          <SkeletonRows rows={8} />
        ) : q.isError ? (
          <ErrorState error={q.error} />
        ) : !q.data?.length ? (
          <EmptyState title="No entries" />
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>When</TH>
                <TH>Actor</TH>
                <TH>Action</TH>
                <TH>Resource</TH>
                <TH>Reason</TH>
                <TH>Before</TH>
                <TH>After</TH>
              </TR>
            </THead>
            <TBody>
              {q.data.map((a) => (
                <TR key={a.id}>
                  <TD className="whitespace-nowrap text-xs">{formatDate(a.createdAt)}</TD>
                  <TD className="text-xs">
                    {a.actorName ?? 'System'}
                    <div className="text-slate-strong">
                      {a.actorRole}
                      {a.ip && ` · ${a.ip}`}
                    </div>
                  </TD>
                  <TD className="font-mono text-xs">{a.action}</TD>
                  <TD className="text-xs">
                    {a.resourceType}
                    <div className="font-mono text-slate-strong">{a.resourceId?.slice(0, 8)}</div>
                  </TD>
                  <TD className="max-w-xs text-xs">{a.reason ?? '—'}</TD>
                  <TD>
                    <Json value={a.oldValue} />
                  </TD>
                  <TD>
                    <Json value={a.newValue} />
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </Card>
    </>
  );
}
