'use client';
import { Priority, TicketStatus, type TicketDto } from '@nexvolt/shared';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { FilterBar, usePaged, useAdminAction } from '@/components/admin/kit';
import { EmptyState, formatDate, PageHeader, StatusBadge } from '@/components/common';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Select, Textarea } from '@/components/ui/input';
import { SkeletonRows } from '@/components/ui/skeleton';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { api } from '@/lib/api';
import { label } from '@/lib/utils';

function TicketDialog({ ticket, onClose }: { ticket: TicketDto; onClose: () => void }) {
  const q = useQuery({ queryKey: ['admin-ticket', ticket.id], queryFn: () => api.support.ticket(ticket.id) });
  const act = useAdminAction([['admin-ticket', ticket.id], ['admin-tickets']], 'Saved');
  const [body, setBody] = useState('');
  const [internal, setInternal] = useState(false);
  const t = q.data ?? ticket;
  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent title={`${t.reference} · ${t.subject}`} description={`${label(t.category)} · ${t.requesterName ?? 'User'} · ${formatDate(t.createdAt)}`} className="max-w-2xl">
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <Select aria-label="Status" className="w-48" value={t.status} onChange={(e) => act.mutate(() => api.admin.updateTicket(t.id, { status: e.target.value as TicketStatus }))}>{Object.values(TicketStatus).map((s) => <option key={s} value={s}>{label(s)}</option>)}</Select>
            <Select aria-label="Priority" className="w-40" value={t.priority} onChange={(e) => act.mutate(() => api.admin.updateTicket(t.id, { priority: e.target.value as Priority }))}>{Object.values(Priority).map((s) => <option key={s} value={s}>{label(s)}</option>)}</Select>
          </div>
          <p className="rounded-md bg-background p-3 text-sm">{t.description}</p>
          <ul className="max-h-64 space-y-2 overflow-y-auto">
            {(t.messages ?? []).map((m) => <li key={m.id} className={`rounded-md p-3 text-sm ${m.internal ? 'border border-dashed border-warning bg-warning-soft' : 'bg-teal-soft'}`}><p className="text-xs font-semibold">{m.authorName ?? 'User'}{m.internal && ' · internal note'} · {formatDate(m.createdAt)}</p><p>{m.body}</p></li>)}
          </ul>
          <form className="space-y-2" onSubmit={(e) => { e.preventDefault(); act.mutate(() => api.support.message(t.id, body, internal), { onSuccess: () => setBody('') }); }}>
            <Textarea aria-label="Reply" value={body} onChange={(e) => setBody(e.target.value)} required placeholder={internal ? 'Internal note (not visible to the user)' : 'Reply to the user'} />
            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="h-4 w-4 accent-[#0B7A6E]" checked={internal} onChange={(e) => setInternal(e.target.checked)} /> Internal note</label>
              <Button type="submit" loading={act.isPending}>Send</Button>
            </div>
          </form>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function SupportPage() {
  const p = usePaged('admin-tickets', api.admin.tickets);
  const [open, setOpen] = useState<TicketDto | null>(null);
  const d = p.query.data;
  return (
    <>
      <PageHeader title="Support" description="Open tickets by priority. Safety tickets start at high priority." />
      <FilterBar statuses={Object.values(TicketStatus)} status={p.status} onStatus={p.setStatus} />
      <Card>{p.query.isLoading ? <SkeletonRows /> : !d?.items.length ? <CardContent><EmptyState title="No tickets" /></CardContent> : (
        <Table>
          <THead><TR><TH>Ticket</TH><TH>Category</TH><TH>Priority</TH><TH>Status</TH><TH>Updated</TH></TR></THead>
          <TBody>{d.items.map((t) => (
            <TR key={t.id} className="cursor-pointer" onClick={() => setOpen(t)}>
              <TD><button className="text-left font-semibold text-teal-strong hover:underline">{t.reference}</button><div className="text-sm">{t.subject}</div></TD>
              <TD>{label(t.category)}</TD>
              <TD><StatusBadge status={t.priority} /></TD>
              <TD><StatusBadge status={t.status} /></TD>
              <TD className="text-xs">{formatDate(t.updatedAt)}</TD>
            </TR>
          ))}</TBody>
        </Table>
      )}</Card>
      {open && <TicketDialog ticket={open} onClose={() => setOpen(null)} />}
    </>
  );
}
