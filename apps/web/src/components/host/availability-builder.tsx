'use client';
import { ApprovalMode, type ChargerManageDto } from '@nexvolt/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Copy, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Field, Input, Select } from '@/components/ui/input';
import { useToast } from '@/components/ui/toast';
import { api, errorMessage } from '@/lib/api';
import { DAYS, fromHHMM, istDay, istTime, toHHMM } from '@/lib/time';
import { formatDate, StatusBadge } from '@/components/common';

type Win = { start: string; end: string };
const ORDER = [1, 2, 3, 4, 5, 6, 0];
/** 15-minute steps, 00:00 … 24:00 (24:00 = midnight at the end of the day). */
const STEPS = Array.from({ length: 97 }, (_, i) => (i === 96 ? '24:00' : toHHMM(i * 15)));
const fmt12 = (hhmm: string) => {
  if (hhmm === '24:00') return '12:00 am (midnight)';
  const [h, m] = hhmm.split(':').map(Number) as [number, number];
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${h < 12 ? 'am' : 'pm'}`;
};

function TimeSelect({ value, onChange, label, from, to }: { value: string; onChange: (v: string) => void; label: string; from?: number; to?: number }) {
  return (
    <Select aria-label={label} className="w-44" value={value} onChange={(e) => onChange(e.target.value)}>
      {STEPS.slice(from ?? 0, to ?? 97).map((t) => <option key={t} value={t}>{fmt12(t)}</option>)}
    </Select>
  );
}

export function AvailabilityBuilder({ charger }: { charger: ChargerManageDto }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [days, setDays] = useState<Record<number, Win[]>>(() => {
    const d: Record<number, Win[]> = { 0: [], 1: [], 2: [], 3: [], 4: [], 5: [], 6: [] };
    for (const r of charger.rules) d[r.dayOfWeek]!.push({ start: toHHMM(r.startMinute), end: r.endMinute === 1440 ? '24:00' : toHHMM(r.endMinute) });
    return d;
  });
  const [buffer, setBuffer] = useState(String(charger.bufferMinutes));
  const [min, setMin] = useState(String(charger.minDurationMinutes));
  const [max, setMax] = useState(String(charger.maxDurationMinutes));
  const [approval, setApproval] = useState<ApprovalMode>(charger.approvalMode);
  const [conflicts, setConflicts] = useState<Array<{ bookingId: string; code: string; startAt: string }>>([]);

  const save = useMutation({
    mutationFn: () =>
      api.chargers.setAvailability(charger.id, {
        rules: ORDER.flatMap((d) => days[d]!.map((w) => ({ dayOfWeek: d, startMinute: fromHHMM(w.start), endMinute: fromHHMM(w.end) }))),
        bufferMinutes: Number(buffer),
        minDurationMinutes: Number(min),
        maxDurationMinutes: Number(max),
        approvalMode: approval,
      }),
    onSuccess: (r) => {
      setConflicts(r.conflicts);
      void qc.invalidateQueries({ queryKey: ['charger', charger.id] });
      toast({ tone: 'success', message: 'Availability saved' });
    },
    onError: (e) => toast({ tone: 'error', message: errorMessage(e) }),
  });

  const update = (d: number, i: number, k: keyof Win, v: string) => setDays((x) => ({ ...x, [d]: x[d]!.map((w, j) => (j === i ? { ...w, [k]: v } : w)) }));
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Weekly hours</CardTitle>
          <CardDescription>India Standard Time, in 15-minute steps. A window ending at midnight joins the next day’s window starting at midnight, so overnight bookings work.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {ORDER.map((d) => (
            <div key={d} className="flex flex-col gap-2 border-b border-line pb-3 last:border-0 sm:flex-row sm:items-start">
              <p className="w-28 pt-2 text-sm font-semibold">{DAYS[d]}</p>
              <div className="flex-1 space-y-2">
                {days[d]!.length === 0 && <p className="pt-2 text-sm text-slate-strong">Unavailable</p>}
                {days[d]!.map((w, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <TimeSelect label={`${DAYS[d]} window ${i + 1} start`} value={w.start} onChange={(v) => update(d, i, 'start', v)} to={96} />
                    <span className="text-slate-strong">to</span>
                    <TimeSelect label={`${DAYS[d]} window ${i + 1} end`} value={w.end} onChange={(v) => update(d, i, 'end', v)} from={1} />
                    <Button type="button" variant="ghost" size="icon" aria-label="Remove window" onClick={() => setDays((x) => ({ ...x, [d]: x[d]!.filter((_, j) => j !== i) }))}><Trash2 className="h-4 w-4" /></Button>
                  </div>
                ))}
              </div>
              <div className="flex gap-2">
                <Button type="button" variant="secondary" size="sm" onClick={() => setDays((x) => ({ ...x, [d]: [...x[d]!, { start: '08:00', end: '20:00' }] }))}><Plus className="h-4 w-4" /> Window</Button>
                {d === 1 && <Button type="button" variant="ghost" size="sm" onClick={() => setDays((x) => ({ ...x, 2: [...x[1]!], 3: [...x[1]!], 4: [...x[1]!], 5: [...x[1]!] }))}><Copy className="h-4 w-4" /> Copy to weekdays</Button>}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>Booking rules</CardTitle></CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-4">
          <Field label="Buffer between bookings (min)" htmlFor="bf"><Input id="bf" type="number" min={0} max={120} step={5} value={buffer} onChange={(e) => setBuffer(e.target.value)} /></Field>
          <Field label="Minimum duration (min)" htmlFor="mn"><Input id="mn" type="number" min={15} step={15} value={min} onChange={(e) => setMin(e.target.value)} /></Field>
          <Field label="Maximum duration (min)" htmlFor="mx"><Input id="mx" type="number" min={15} step={15} value={max} onChange={(e) => setMax(e.target.value)} /></Field>
          <Field label="Approval" htmlFor="ap" hint={approval === 'MANUAL' ? 'You approve each request before the driver pays.' : 'Bookings confirm as soon as payment succeeds.'}>
            <Select id="ap" value={approval} onChange={(e) => setApproval(e.target.value as ApprovalMode)}><option value="AUTOMATIC">Automatic</option><option value="MANUAL">Manual</option></Select>
          </Field>
        </CardContent>
      </Card>
      {conflicts.length > 0 && (
        <div role="alert" className="rounded-md border border-warning bg-warning-soft p-4 text-sm text-warning-strong">
          <p className="font-semibold">{conflicts.length} upcoming booking(s) fall outside the new hours. They were NOT cancelled — honour them or cancel from your booking queue:</p>
          <ul className="mt-1 list-disc pl-5">{conflicts.map((c) => <li key={c.bookingId}>{c.code} · {istDay(c.startAt)} {istTime(c.startAt)}</li>)}</ul>
        </div>
      )}
      <div className="flex justify-end"><Button onClick={() => save.mutate()} loading={save.isPending}>Save availability</Button></div>
      <ExceptionsEditor charger={charger} />
    </div>
  );
}

function ExceptionsEditor({ charger }: { charger: ChargerManageDto }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [date, setDate] = useState('');
  const [type, setType] = useState<'BLACKOUT' | 'CUSTOM_HOURS'>('BLACKOUT');
  const [start, setStart] = useState('09:00');
  const [end, setEnd] = useState('18:00');
  const [reason, setReason] = useState('');
  const refresh = () => qc.invalidateQueries({ queryKey: ['charger', charger.id] });
  const add = useMutation({
    mutationFn: () => api.chargers.addException(charger.id, { date, type, startMinute: type === 'CUSTOM_HOURS' ? fromHHMM(start) : null, endMinute: type === 'CUSTOM_HOURS' ? fromHHMM(end) : null, reason: reason || null }),
    onSuccess: (r) => {
      void refresh();
      setDate('');
      setReason('');
      toast({ tone: 'success', message: r.conflicts.length ? `Saved. ${r.conflicts.length} existing booking(s) conflict — they were not cancelled.` : 'Exception added' });
    },
    onError: (e) => toast({ tone: 'error', message: errorMessage(e) }),
  });
  const remove = useMutation({ mutationFn: (id: string) => api.chargers.removeException(charger.id, id), onSuccess: () => void refresh() });
  return (
    <Card>
      <CardHeader><CardTitle>Blackout dates & one-off hours</CardTitle><CardDescription>Custom hours replace your weekly hours for that date.</CardDescription></CardHeader>
      <CardContent className="space-y-4">
        <form className="grid gap-3 sm:grid-cols-6 sm:items-end" onSubmit={(e) => { e.preventDefault(); add.mutate(); }}>
          <Field label="Date" htmlFor="exd"><Input id="exd" type="date" value={date} onChange={(e) => setDate(e.target.value)} required /></Field>
          <Field label="Type" htmlFor="ext"><Select id="ext" value={type} onChange={(e) => setType(e.target.value as 'BLACKOUT' | 'CUSTOM_HOURS')}><option value="BLACKOUT">Blackout (closed)</option><option value="CUSTOM_HOURS">Custom hours</option></Select></Field>
          {type === 'CUSTOM_HOURS' && <Field label="From" htmlFor="exs"><TimeSelect label="From" value={start} onChange={setStart} to={96} /></Field>}
          {type === 'CUSTOM_HOURS' && <Field label="To" htmlFor="exe"><TimeSelect label="To" value={end} onChange={setEnd} from={1} /></Field>}
          <Field label="Note" htmlFor="exr"><Input id="exr" value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
          <Button type="submit" loading={add.isPending}>Add</Button>
        </form>
        {charger.exceptions.length > 0 && (
          <ul className="divide-y divide-line text-sm">
            {charger.exceptions.map((e) => (
              <li key={e.id} className="flex items-center justify-between py-2">
                <span>{formatDate(`${e.date}T00:00:00+05:30`, false)} · <StatusBadge status={e.type} /> {e.type === 'CUSTOM_HOURS' && `${toHHMM(e.startMinute!)}–${toHHMM(e.endMinute!)}`} {e.reason && <span className="text-slate-strong">· {e.reason}</span>}</span>
                <Button variant="ghost" size="icon" aria-label="Remove exception" onClick={() => remove.mutate(e.id)}><Trash2 className="h-4 w-4" /></Button>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
