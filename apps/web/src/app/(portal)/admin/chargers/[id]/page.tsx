'use client';
import { useQuery } from '@tanstack/react-query';
import { CheckCircle2, XCircle } from 'lucide-react';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { OpenDocument, useAdminAction } from '@/components/admin/kit';
import {
  ConnectorBadge,
  ErrorState,
  formatDate,
  Money,
  PageHeader,
  ReasonDialog,
  SampleBadge,
  StatusBadge,
} from '@/components/common';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { SkeletonRows } from '@/components/ui/skeleton';
import { api } from '@/lib/api';
import { DAYS, toHHMM } from '@/lib/time';
import { label } from '@/lib/utils';

const CHECKLIST_COPY: Record<string, string> = {
  hostIdentityVerified: 'Host identity verified (accepted ID document)',
  propertyAuthorizationReviewed: 'Property / parking authorisation or society NOC reviewed',
  electricalSafetyCertificateReviewed:
    'Electrical safety certificate reviewed and matches this installation',
  installationDetailsReviewed:
    'Installation details (rating, protection devices) consistent with declared max power',
  listingContentReviewed: 'Listing text, pricing and access info appropriate',
  photosReviewed: 'Photos reviewed (no personal data, matches description)',
};

export default function AdminChargerDetail() {
  const { id } = useParams<{ id: string }>();
  const q = useQuery({ queryKey: ['admin-charger', id], queryFn: () => api.admin.charger(id) });
  const act = useAdminAction(
    [['admin-charger', id], ['admin-chargers'], ['admin-overview']],
    'Saved',
  );
  const [checklist, setChecklist] = useState<Record<string, boolean>>({});
  const [dialog, setDialog] = useState<
    null | 'APPROVED' | 'REJECTED' | 'CHANGES_REQUESTED' | 'SUSPEND' | 'REINSTATE'
  >(null);

  if (q.isLoading) return <SkeletonRows rows={8} />;
  if (q.isError || !q.data) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  const c = q.data;
  const allChecked = c.checklistItems.every((k) => checklist[k]);
  return (
    <div className="max-w-6xl">
      <PageHeader
        title={c.title}
        description={`${c.address.line1}, ${c.locality}, ${c.city} ${c.address.pincode} — exact address visible to staff only`}
        actions={
          <>
            <StatusBadge status={c.status} />
            {c.isPublished ? <Badge tone="positive">Live</Badge> : <Badge>Hidden</Badge>}
            {c.isSample && <SampleBadge />}
            {c.status === 'SUSPENDED' ? (
              <Button variant="secondary" onClick={() => setDialog('REINSTATE')}>
                Reinstate
              </Button>
            ) : (
              <Button variant="danger" onClick={() => setDialog('SUSPEND')}>
                Suspend
              </Button>
            )}
          </>
        }
      />
      {c.suspensionReason && (
        <p className="mb-4 rounded-md border border-danger bg-danger-soft p-3 text-sm text-danger-strong">
          Suspended: {c.suspensionReason}
        </p>
      )}
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>Listing & hardware</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3 text-sm sm:grid-cols-2">
              <p>
                <span className="text-slate-strong">Current / max power:</span> {c.currentType} ·{' '}
                {c.maxPowerKw} kW
              </p>
              <p className="flex flex-wrap gap-1">
                {c.connectors.map((k) => (
                  <ConnectorBadge key={k.connectorType} type={k.connectorType} kw={k.powerKw} />
                ))}
              </p>
              <p>
                <span className="text-slate-strong">Make/model:</span> {c.chargerMake ?? '—'}{' '}
                {c.chargerModel ?? ''}
              </p>
              <p>
                <span className="text-slate-strong">Serial:</span> {c.serialNumber ?? '—'}
              </p>
              <p>
                <span className="text-slate-strong">Metering:</span> {label(c.meterType)}{' '}
                {c.verifiedMeter && <Badge tone="positive">Verified meter</Badge>}
              </p>
              <p>
                <span className="text-slate-strong">Smart / integration:</span>{' '}
                {c.smartCapable ? 'Yes' : 'No'} {c.integrationProvider ?? ''}
              </p>
              <p>
                <span className="text-slate-strong">Price:</span> <Money minor={c.unitPriceMinor} />{' '}
                / {c.pricingUnit === 'PER_HOUR' ? 'hour' : 'kWh'}
              </p>
              <p>
                <span className="text-slate-strong">Policy / approval:</span>{' '}
                {label(c.cancellationPolicy)} · {label(c.approvalMode)}
              </p>
              <p className="sm:col-span-2">
                <span className="text-slate-strong">Parking:</span> {label(c.parkingType)}
                {c.parkingNotes ? ` — ${c.parkingNotes}` : ''}
              </p>
              <p className="sm:col-span-2">
                <span className="text-slate-strong">Access (private):</span>{' '}
                {c.accessInstructions ?? '—'}
              </p>
              <p className="sm:col-span-2">
                <span className="text-slate-strong">Safety notes:</span> {c.safetyNotes ?? '—'}
              </p>
              <p className="sm:col-span-2 text-xs text-slate-strong">
                Exact {c.exactLocation.lat.toFixed(5)}, {c.exactLocation.lng.toFixed(5)} · public
                approx {c.approxLocation.lat.toFixed(4)}, {c.approxLocation.lng.toFixed(4)}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Documents</CardTitle>
            </CardHeader>
            <CardContent>
              {!c.documents.length ? (
                <p className="text-sm text-slate-strong">No documents uploaded.</p>
              ) : (
                <ul className="divide-y divide-line text-sm">
                  {c.documents.map((d) => (
                    <li key={d.id} className="flex items-center justify-between py-2">
                      <span>
                        <OpenDocument id={d.id} name={d.fileName} />{' '}
                        <span className="text-xs text-slate-strong">· {label(d.docType)}</span>
                      </span>
                      <StatusBadge status={d.status} />
                    </li>
                  ))}
                </ul>
              )}
              <p className="mt-2 text-xs text-slate-strong">
                Accept or reject individual documents in Verification → Documents.
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Availability</CardTitle>
            </CardHeader>
            <CardContent className="text-sm">
              {c.rules.length === 0
                ? 'No weekly hours set.'
                : c.rules.map((r) => (
                    <p key={r.id}>
                      {DAYS[r.dayOfWeek]}: {toHHMM(r.startMinute)}–
                      {r.endMinute === 1440 ? '24:00' : toHHMM(r.endMinute)}
                    </p>
                  ))}
              <p className="mt-2 text-slate-strong">
                Buffer {c.bufferMinutes} min · {c.minDurationMinutes}–{c.maxDurationMinutes} min
                bookings
              </p>
            </CardContent>
          </Card>
        </div>
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Host</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1 text-sm">
              <p className="font-semibold">{c.hostDetail.displayName}</p>
              <p className="text-slate-strong">
                {c.hostDetail.userName} · {c.hostDetail.phoneMasked}
              </p>
              <p>
                Identity: <StatusBadge status={c.hostDetail.kycStatus} />
              </p>
            </CardContent>
          </Card>
          {c.status === 'PENDING_REVIEW' && (
            <Card>
              <CardHeader>
                <CardTitle>Approval checklist</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {c.checklistItems.map((k) => (
                  <label key={k} className="flex items-start gap-3 text-sm">
                    <input
                      type="checkbox"
                      className="mt-1 h-4 w-4 accent-[#0B7A6E]"
                      checked={!!checklist[k]}
                      onChange={(e) => setChecklist({ ...checklist, [k]: e.target.checked })}
                    />
                    {CHECKLIST_COPY[k] ?? k}
                  </label>
                ))}
                <div className="flex flex-wrap gap-2 pt-2">
                  <Button disabled={!allChecked} onClick={() => setDialog('APPROVED')}>
                    <CheckCircle2 className="h-4 w-4" /> Approve
                  </Button>
                  <Button variant="secondary" onClick={() => setDialog('CHANGES_REQUESTED')}>
                    Request changes
                  </Button>
                  <Button variant="danger" onClick={() => setDialog('REJECTED')}>
                    <XCircle className="h-4 w-4" /> Reject
                  </Button>
                </div>
                <p className="text-xs text-slate-strong">
                  The server also enforces: verified host, accepted property and electrical-safety
                  documents.
                </p>
              </CardContent>
            </Card>
          )}
          <Card>
            <CardHeader>
              <CardTitle>Verification history</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              {c.verifications.map((v) => (
                <div key={v.id} className="rounded-md bg-background p-2">
                  <StatusBadge status={v.status} />{' '}
                  <span className="text-xs text-slate-strong">{formatDate(v.submittedAt)}</span>
                  {v.notes && <p className="mt-1">“{v.notes}”</p>}
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>
      {dialog && (
        <ReasonDialog
          open
          onOpenChange={(v) => !v && setDialog(null)}
          title={
            {
              APPROVED: 'Approve and verify charger',
              REJECTED: 'Reject charger',
              CHANGES_REQUESTED: 'Request changes',
              SUSPEND: 'Suspend charger',
              REINSTATE: 'Reinstate charger',
            }[dialog]
          }
          description={
            dialog === 'SUSPEND'
              ? 'Hides the listing and blocks new bookings. Existing bookings are not cancelled automatically — cancel them from Bookings if unsafe.'
              : dialog === 'APPROVED'
                ? 'The host will be notified and can publish the listing.'
                : undefined
          }
          danger={dialog === 'REJECTED' || dialog === 'SUSPEND'}
          onConfirm={(reason) =>
            act.mutateAsync(() =>
              dialog === 'SUSPEND'
                ? api.admin.suspendCharger(id, reason)
                : dialog === 'REINSTATE'
                  ? api.admin.reinstateCharger(id, reason)
                  : api.admin.decideCharger(id, { decision: dialog, checklist, reason }),
            )
          }
        />
      )}
    </div>
  );
}
