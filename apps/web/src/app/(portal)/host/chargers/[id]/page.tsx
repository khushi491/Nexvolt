'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { ErrorState, PageHeader, ReasonDialog, StatusBadge } from '@/components/common';
import { AvailabilityBuilder } from '@/components/host/availability-builder';
import { ChargerForm } from '@/components/host/charger-form';
import { DocumentsPanel, PhotosPanel, VerificationPanel } from '@/components/host/charger-panels';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { SkeletonRows } from '@/components/ui/skeleton';
import { useToast } from '@/components/ui/toast';
import { api, errorMessage } from '@/lib/api';
import { cn } from '@/lib/utils';

const TABS = [
  { id: 'details', label: 'Details' },
  { id: 'availability', label: 'Availability' },
  { id: 'documents', label: 'Documents' },
  { id: 'photos', label: 'Photos' },
  { id: 'verification', label: 'Verification' },
] as const;

function ChargerDetail() {
  const { id } = useParams<{ id: string }>();
  const params = useSearchParams();
  const router = useRouter();
  const tab = (params.get('tab') ?? 'details') as (typeof TABS)[number]['id'];
  const qc = useQueryClient();
  const toast = useToast();
  const [pauseOpen, setPauseOpen] = useState(false);
  const q = useQuery({ queryKey: ['charger', id], queryFn: () => api.chargers.manage(id) });
  const done = (m: string) => () => {
    void qc.invalidateQueries({ queryKey: ['charger', id] });
    void qc.invalidateQueries({ queryKey: ['my-chargers'] });
    toast({ tone: 'success', message: m });
  };
  const fail = (e: unknown) => toast({ tone: 'error', message: errorMessage(e) });
  const update = useMutation({
    mutationFn: (input: Parameters<typeof api.chargers.update>[1]) =>
      api.chargers.update(id, input),
    onSuccess: (c) =>
      done(
        c.status === 'PENDING_REVIEW' && q.data?.status === 'VERIFIED'
          ? 'Saved. Material changes sent the listing back for review.'
          : 'Saved',
      )(),
    onError: fail,
  });
  const publish = useMutation({
    mutationFn: () => (q.data?.isPublished ? api.chargers.unpublish(id) : api.chargers.publish(id)),
    onSuccess: done('Updated'),
    onError: fail,
  });
  const resume = useMutation({
    mutationFn: () => api.chargers.resume(id),
    onSuccess: done('Resumed'),
    onError: fail,
  });

  if (q.isLoading) return <SkeletonRows rows={6} />;
  if (q.isError || !q.data) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  const c = q.data;
  return (
    <div className="max-w-5xl">
      <PageHeader
        title={c.title}
        description={`${c.locality}, ${c.city}`}
        actions={
          <>
            <StatusBadge status={c.status} />
            {c.isPublished ? <Badge tone="positive">Live</Badge> : <Badge>Hidden</Badge>}
            {c.status === 'VERIFIED' && (
              <Button
                variant="secondary"
                onClick={() => publish.mutate()}
                loading={publish.isPending}
              >
                {c.isPublished ? 'Unpublish' : 'Publish'}
              </Button>
            )}
            {c.pausedAt ? (
              <Button
                variant="secondary"
                onClick={() => resume.mutate()}
                loading={resume.isPending}
              >
                Resume
              </Button>
            ) : (
              <Button variant="danger" onClick={() => setPauseOpen(true)}>
                Pause
              </Button>
            )}
          </>
        }
      />
      {c.pausedAt && (
        <p className="mb-4 rounded-md border border-warning bg-warning-soft p-3 text-sm text-warning-strong">
          Paused{c.pauseReason ? `: ${c.pauseReason}` : ''}. Hidden from search; existing bookings
          are not cancelled automatically.
        </p>
      )}
      {c.status === 'SUSPENDED' && (
        <p className="mb-4 rounded-md border border-danger bg-danger-soft p-3 text-sm text-danger-strong">
          Suspended by Nexvolt. Contact support before using or editing this charger.
        </p>
      )}
      <div
        role="tablist"
        aria-label="Charger sections"
        className="mb-6 flex gap-1 overflow-x-auto border-b border-line"
      >
        {TABS.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => router.replace(`/host/chargers/${id}?tab=${t.id}`)}
            className={cn(
              'min-h-[44px] whitespace-nowrap border-b-2 px-4 text-sm font-semibold',
              tab === t.id
                ? 'border-teal-strong text-teal-strong'
                : 'border-transparent text-slate-strong hover:text-navy',
            )}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div role="tabpanel">
        {tab === 'details' && (
          <ChargerForm
            key={c.updatedAt}
            charger={c}
            submitLabel="Save changes"
            busy={update.isPending}
            onSubmit={(input) => update.mutate(input)}
          />
        )}
        {tab === 'availability' && <AvailabilityBuilder key={c.updatedAt} charger={c} />}
        {tab === 'documents' && <DocumentsPanel charger={c} />}
        {tab === 'photos' && <PhotosPanel charger={c} />}
        {tab === 'verification' && <VerificationPanel charger={c} />}
      </div>
      <ReasonDialog
        open={pauseOpen}
        onOpenChange={setPauseOpen}
        title="Pause this charger"
        description="Use this for maintenance or any safety concern. The listing is hidden immediately."
        confirmLabel="Pause"
        danger
        onConfirm={async (reason) => {
          const r = await api.chargers.pause(id, reason);
          done(r.notice ?? 'Paused')();
        }}
      />
    </div>
  );
}

export default function ChargerDetailPage() {
  return (
    <Suspense>
      <ChargerDetail />
    </Suspense>
  );
}
