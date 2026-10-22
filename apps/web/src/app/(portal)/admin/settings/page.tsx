'use client';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import type { SettingRow } from '@nexvolt/api-client';
import { useAdminAction } from '@/components/admin/kit';
import { ErrorState, formatDate, PageHeader, ReasonDialog } from '@/components/common';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Field, Input, Select, Textarea } from '@/components/ui/input';
import { SkeletonRows } from '@/components/ui/skeleton';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { api } from '@/lib/api';

function display(v: unknown): string {
  return typeof v === 'object' ? JSON.stringify(v) : String(v);
}

function Editor({ row, onClose }: { row: SettingRow; onClose: () => void }) {
  const act = useAdminAction([['admin-settings']], 'Setting updated');
  const kind = typeof row.value;
  const [raw, setRaw] = useState(kind === 'object' ? JSON.stringify(row.value, null, 2) : String(row.value));
  const parse = (): unknown => (kind === 'number' ? Number(raw) : kind === 'boolean' ? raw === 'true' : kind === 'object' ? JSON.parse(raw) : raw);
  return (
    <ReasonDialog open onOpenChange={(v) => !v && onClose()} title={`Edit ${row.key}`} description={row.description}
      extra={
        <Field label={`Value (default: ${display(row.defaultValue)})`} htmlFor="val">
          {kind === 'boolean' ? <Select id="val" value={raw} onChange={(e) => setRaw(e.target.value)}><option value="true">true</option><option value="false">false</option></Select>
            : kind === 'object' ? <Textarea id="val" className="min-h-[160px] font-mono text-xs" value={raw} onChange={(e) => setRaw(e.target.value)} />
            : <Input id="val" value={raw} onChange={(e) => setRaw(e.target.value)} />}
        </Field>
      }
      onConfirm={(reason) => act.mutateAsync(() => api.admin.updateSetting(row.key, parse(), reason))} />
  );
}

export default function SettingsPage() {
  const q = useQuery({ queryKey: ['admin-settings'], queryFn: () => api.admin.settings() });
  const [editing, setEditing] = useState<SettingRow | null>(null);
  return (
    <>
      <PageHeader title="Platform settings" description="Fees, limits and windows. Validated server-side; every change is audit-logged with old and new values. Defaults are for the demo only and carry no legal or commercial validation." />
      <Card>
        {q.isLoading ? <SkeletonRows rows={8} /> : q.isError ? <ErrorState error={q.error} /> : (
          <Table>
            <THead><TR><TH>Setting</TH><TH>Value</TH><TH>Updated</TH><TH /></TR></THead>
            <TBody>{q.data!.map((r) => (
              <TR key={r.key}>
                <TD><div className="font-mono text-xs font-semibold">{r.key}</div><div className="max-w-md text-xs text-slate-strong">{r.description}</div></TD>
                <TD className="max-w-xs break-all font-mono text-xs">{display(r.value)} {r.overridden && <Badge tone="info">overridden</Badge>}</TD>
                <TD className="text-xs">{formatDate(r.updatedAt)}</TD>
                <TD><Button size="sm" variant="secondary" onClick={() => setEditing(r)}>Edit</Button></TD>
              </TR>
            ))}</TBody>
          </Table>
        )}
      </Card>
      {editing && <Editor row={editing} onClose={() => setEditing(null)} />}
    </>
  );
}
