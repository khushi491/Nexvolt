'use client';
import { useMutation, useQuery, useQueryClient, type QueryKey } from '@tanstack/react-query';
import { Download, Search } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Input, Select } from '@/components/ui/input';
import { useToast } from '@/components/ui/toast';
import { api, errorMessage } from '@/lib/api';
import { cn, label } from '@/lib/utils';

export function usePaged<T>(key: string, fetcher: (q: { q?: string; status?: string; limit: number; offset: number }) => Promise<{ items: T[]; total: number }>, initialStatus = '') {
  const [q, setQ] = useState('');
  const [status, setStatus] = useState(initialStatus);
  const [offset, setOffset] = useState(0);
  const limit = 25;
  const query = useQuery({ queryKey: [key, q, status, offset], queryFn: () => fetcher({ q: q || undefined, status: status || undefined, limit, offset }) });
  return { query, q, setQ: (v: string) => { setQ(v); setOffset(0); }, status, setStatus: (v: string) => { setStatus(v); setOffset(0); }, offset, setOffset, limit };
}

export function FilterBar({ search, onSearch, statuses, status, onStatus, children }: { search?: string; onSearch?: (v: string) => void; statuses?: string[]; status?: string; onStatus?: (v: string) => void; children?: ReactNode }) {
  const [draft, setDraft] = useState(search ?? '');
  return (
    <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center">
      {onSearch && (
        <form className="relative flex-1" onSubmit={(e) => { e.preventDefault(); onSearch(draft.trim()); }} role="search">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate" aria-hidden />
          <Input aria-label="Search" className="pl-9" value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Search…" />
        </form>
      )}
      {statuses && onStatus && (
        <Select aria-label="Status filter" className="sm:w-56" value={status} onChange={(e) => onStatus(e.target.value)}>
          <option value="">All statuses</option>
          {statuses.map((s) => <option key={s} value={s}>{label(s)}</option>)}
        </Select>
      )}
      {children}
    </div>
  );
}

export function Pager({ offset, limit, total, onChange }: { offset: number; limit: number; total: number; onChange: (o: number) => void }) {
  if (total <= limit) return null;
  return (
    <div className="flex items-center justify-between border-t border-line px-4 py-3 text-sm">
      <span className="text-slate-strong">{offset + 1}–{Math.min(offset + limit, total)} of {total}</span>
      <div className="flex gap-2">
        <Button variant="secondary" size="sm" disabled={offset === 0} onClick={() => onChange(Math.max(0, offset - limit))}>Previous</Button>
        <Button variant="secondary" size="sm" disabled={offset + limit >= total} onClick={() => onChange(offset + limit)}>Next</Button>
      </div>
    </div>
  );
}

/** Mutation that toasts and invalidates on success. */
export function useAdminAction(invalidate: QueryKey[], success = 'Done') {
  const qc = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: (fn: () => Promise<unknown>) => fn(),
    onSuccess: () => {
      invalidate.forEach((k) => void qc.invalidateQueries({ queryKey: k }));
      toast({ tone: 'success', message: success });
    },
    onError: (e) => toast({ tone: 'error', message: errorMessage(e) }),
  });
}

export function ExportButton({ type }: { type: 'bookings' | 'payments' | 'ledger' | 'payouts' }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  return (
    <Button variant="secondary" size="sm" loading={busy} onClick={async () => {
      setBusy(true);
      try {
        const csv = await api.admin.exportCsv(type);
        const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
        const a = Object.assign(document.createElement('a'), { href: url, download: `nexvolt-${type}-${new Date().toISOString().slice(0, 10)}.csv` });
        a.click();
        URL.revokeObjectURL(url);
      } catch (e) {
        toast({ tone: 'error', message: errorMessage(e) });
      } finally {
        setBusy(false);
      }
    }}><Download className="h-4 w-4" /> Export {type} CSV</Button>
  );
}

export function Tabs<T extends string>({ tabs, value, onChange }: { tabs: Array<{ id: T; label: string; count?: number }>; value: T; onChange: (v: T) => void }) {
  return (
    <div role="tablist" className="mb-4 flex gap-1 overflow-x-auto border-b border-line">
      {tabs.map((t) => (
        <button key={t.id} role="tab" aria-selected={value === t.id} onClick={() => onChange(t.id)} className={cn('min-h-[44px] whitespace-nowrap border-b-2 px-4 text-sm font-semibold', value === t.id ? 'border-teal-strong text-teal-strong' : 'border-transparent text-slate-strong hover:text-navy')}>
          {t.label}{t.count != null && <span className="ml-2 rounded-pill bg-background px-2 py-0.5 text-xs">{t.count}</span>}
        </button>
      ))}
    </div>
  );
}

export function OpenDocument({ id, name }: { id: string; name: string }) {
  const toast = useToast();
  return (
    <button className="text-left text-sm font-medium text-teal-strong underline-offset-2 hover:underline" onClick={async () => {
      try {
        const { url } = await api.documents.url(id);
        if (url) window.open(url, '_blank', 'noopener,noreferrer');
      } catch (e) {
        toast({ tone: 'error', message: errorMessage(e) });
      }
    }}>{name}</button>
  );
}

export function Json({ value }: { value: unknown }) {
  if (value == null) return <span className="text-slate">—</span>;
  return <pre className="max-h-48 max-w-md overflow-auto whitespace-pre-wrap break-all rounded-md bg-background p-2 text-xs">{JSON.stringify(value, null, 2)}</pre>;
}
