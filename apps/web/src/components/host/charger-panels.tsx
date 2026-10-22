'use client';
import { DocumentType, type ChargerManageDto } from '@nexvolt/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, Circle, FileUp, ImagePlus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { formatDate, StatusBadge } from '@/components/common';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/components/ui/toast';
import { api, errorMessage } from '@/lib/api';
import { useSession } from '@/lib/session';
import { uploadDocument, uploadPhoto } from '@/lib/upload';

const CHARGER_DOCS: Array<{ type: DocumentType; title: string; required: boolean; hint: string }> = [
  { type: 'PROPERTY_AUTHORIZATION', title: 'Property / parking authorisation', required: true, hint: 'Ownership proof, rental agreement permitting EV charging, or written owner consent.' },
  { type: 'SOCIETY_NOC', title: 'Society / RWA NOC', required: false, hint: 'Required for apartment complexes; accepted in place of property authorisation.' },
  { type: 'ELECTRICAL_SAFETY_CERT', title: 'Electrical safety certificate', required: true, hint: 'Issued by a licensed electrical contractor for this installation.' },
  { type: 'INSTALLATION_CERT', title: 'Installation details', required: false, hint: 'Installer invoice / commissioning report showing rating and protection devices.' },
  { type: 'METER_CALIBRATION_CERT', title: 'Meter calibration certificate', required: false, hint: 'Needed only for per-kWh pricing on a sub-meter.' },
];

export function DocumentsPanel({ charger }: { charger: ChargerManageDto }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  return (
    <Card>
      <CardHeader><CardTitle>Verification documents</CardTitle><CardDescription>Stored privately; only you and Nexvolt reviewers can open them. PDF/JPEG/PNG, ≤10 MB.</CardDescription></CardHeader>
      <CardContent>
        <ul className="divide-y divide-line">
          {CHARGER_DOCS.map((d) => {
            const docs = charger.documents.filter((x) => x.docType === d.type);
            return (
              <li key={d.type} className="flex flex-col gap-3 py-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <p className="font-semibold">{d.title} {d.required && <span className="text-xs font-medium text-danger-strong">required</span>}</p>
                  <p className="text-sm text-slate-strong">{d.hint}</p>
                  {docs.map((x) => (
                    <p key={x.id} className="mt-1 flex flex-wrap items-center gap-2 text-sm">{x.fileName} <StatusBadge status={x.status} /> {x.reviewNotes && <span className="text-xs text-slate-strong">“{x.reviewNotes}”</span>}</p>
                  ))}
                </div>
                <label className="inline-flex min-h-[44px] shrink-0 cursor-pointer items-center gap-2 rounded-md border border-line-strong px-3 text-sm font-semibold text-teal-strong hover:bg-background">
                  <FileUp className="h-4 w-4" /> {busy === d.type ? 'Uploading…' : 'Upload'}
                  <input type="file" className="sr-only" accept="application/pdf,image/jpeg,image/png" disabled={!!busy}
                    onChange={async (e) => {
                      const f = e.target.files?.[0];
                      e.target.value = '';
                      if (!f) return;
                      setBusy(d.type);
                      try {
                        await uploadDocument(f, d.type, charger.id);
                        await qc.invalidateQueries({ queryKey: ['charger', charger.id] });
                        toast({ tone: 'success', message: 'Uploaded and checked' });
                      } catch (x) {
                        toast({ tone: 'error', message: errorMessage(x) });
                      } finally {
                        setBusy(null);
                      }
                    }} />
                </label>
              </li>
            );
          })}
        </ul>
      </CardContent>
    </Card>
  );
}

export function PhotosPanel({ charger }: { charger: ChargerManageDto }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const remove = useMutation({ mutationFn: (id: string) => api.chargers.photoRemove(charger.id, id), onSuccess: () => qc.invalidateQueries({ queryKey: ['charger', charger.id] }) });
  return (
    <Card>
      <CardHeader><CardTitle>Photos</CardTitle><CardDescription>Show the charger, the parking spot and the approach. Avoid house numbers and faces. JPEG/PNG/WebP ≤8 MB.</CardDescription></CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {charger.photos.map((p) => (
            <div key={p.id} className="group relative aspect-[4/3] overflow-hidden rounded-md bg-background">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={p.url} alt="Charger photo" className="h-full w-full object-cover" />
              <button onClick={() => remove.mutate(p.id)} className="absolute right-2 top-2 rounded-md bg-white/90 p-2 shadow" aria-label="Delete photo"><Trash2 className="h-4 w-4" /></button>
            </div>
          ))}
          <label className="flex aspect-[4/3] cursor-pointer flex-col items-center justify-center gap-2 rounded-md border border-dashed border-line-strong text-sm font-semibold text-teal-strong hover:bg-background">
            <ImagePlus className="h-6 w-6" /> {busy ? 'Uploading…' : 'Add photo'}
            <input type="file" className="sr-only" accept="image/jpeg,image/png,image/webp" disabled={busy}
              onChange={async (e) => {
                const f = e.target.files?.[0];
                e.target.value = '';
                if (!f) return;
                setBusy(true);
                try {
                  await uploadPhoto(f, charger.id);
                  await qc.invalidateQueries({ queryKey: ['charger', charger.id] });
                } catch (x) {
                  toast({ tone: 'error', message: errorMessage(x) });
                } finally {
                  setBusy(false);
                }
              }} />
          </label>
        </div>
      </CardContent>
    </Card>
  );
}

export function VerificationPanel({ charger }: { charger: ChargerManageDto }) {
  const qc = useQueryClient();
  const toast = useToast();
  const { user } = useSession();
  const [problems, setProblems] = useState<string[]>([]);
  const submit = useMutation({
    mutationFn: () => api.chargers.submit(charger.id),
    onSuccess: () => { setProblems([]); void qc.invalidateQueries({ queryKey: ['charger', charger.id] }); toast({ tone: 'success', message: 'Submitted for review' }); },
    onError: (e) => {
      const details = (e as { details?: unknown }).details;
      setProblems(Array.isArray(details) ? (details as string[]) : [errorMessage(e)]);
    },
  });
  const accepted = (t: DocumentType[]) => charger.documents.some((d) => t.includes(d.docType) && (d.status === 'PENDING_REVIEW' || d.status === 'ACCEPTED'));
  const steps = [
    { done: user?.hostProfile?.kycStatus === 'VERIFIED' || user?.hostProfile?.kycStatus === 'PENDING_REVIEW', label: 'Identity document submitted' },
    { done: charger.rules.length > 0, label: 'Weekly availability set' },
    { done: accepted(['PROPERTY_AUTHORIZATION', 'SOCIETY_NOC']), label: 'Property authorisation uploaded' },
    { done: accepted(['ELECTRICAL_SAFETY_CERT']), label: 'Electrical safety certificate uploaded' },
    { done: charger.status === 'VERIFIED', label: 'Approved by a Nexvolt reviewer' },
  ];
  return (
    <Card>
      <CardHeader><CardTitle>Verification</CardTitle><CardDescription>Only a Nexvolt reviewer can verify a listing. Approval is based on the documents above; Nexvolt does not inspect sites in this release.</CardDescription></CardHeader>
      <CardContent className="space-y-5">
        <ol className="space-y-2">
          {steps.map((s) => <li key={s.label} className="flex items-center gap-2 text-sm">{s.done ? <CheckCircle2 className="h-4 w-4 text-positive-strong" /> : <Circle className="h-4 w-4 text-slate" />}{s.label}</li>)}
        </ol>
        {problems.length > 0 && <ul role="alert" className="list-disc rounded-md bg-danger-soft p-4 pl-8 text-sm text-danger-strong">{problems.map((p) => <li key={p}>{p}</li>)}</ul>}
        {(charger.status === 'DRAFT' || charger.status === 'REJECTED') && <Button onClick={() => submit.mutate()} loading={submit.isPending}>Submit for review</Button>}
        {charger.status === 'PENDING_REVIEW' && <p className="text-sm text-slate-strong">Under review. You’ll get a notification when a decision is made.</p>}
        {charger.verifications.length > 0 && (
          <div>
            <p className="mb-2 text-sm font-semibold">History</p>
            <ul className="space-y-2 text-sm">
              {charger.verifications.map((v) => (
                <li key={v.id} className="rounded-md bg-background p-3"><StatusBadge status={v.status} /> <span className="text-slate-strong">submitted {formatDate(v.submittedAt)}{v.decidedAt && ` · decided ${formatDate(v.decidedAt)}`}</span>{v.notes && <p className="mt-1">“{v.notes}”</p>}</li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
