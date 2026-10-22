'use client';
import { IncidentStatus } from '@nexvolt/shared';
import Link from 'next/link';
import { useState } from 'react';
import { FilterBar, usePaged, useAdminAction } from '@/components/admin/kit';
import { EmptyState, formatDate, PageHeader, StatusBadge } from '@/components/common';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Field, Select, Textarea } from '@/components/ui/input';
import { SkeletonRows } from '@/components/ui/skeleton';
import { api } from '@/lib/api';
import { label } from '@/lib/utils';

export default function IncidentsPage() {
  const p = usePaged('admin-incidents', api.admin.incidents);
  const act = useAdminAction([['admin-incidents'], ['admin-overview']], 'Incident updated');
  const [edit, setEdit] = useState<{ id: string; status: IncidentStatus } | null>(null);
  const [notes, setNotes] = useState('');
  const d = p.query.data;
  return (
    <>
      <PageHeader
        title="Safety incidents"
        description="CRITICAL reports auto-suspend the charger. Escalate anything involving fire, injury or electrical hazard to emergency services and the host immediately."
      />
      <FilterBar
        statuses={Object.values(IncidentStatus)}
        status={p.status}
        onStatus={p.setStatus}
      />
      {p.query.isLoading ? (
        <SkeletonRows />
      ) : !d?.items.length ? (
        <Card>
          <EmptyState title="No open incidents" />
        </Card>
      ) : (
        <div className="space-y-3">
          {d.items.map((i) => (
            <Card key={i.id} className={i.severity === 'CRITICAL' ? 'border-danger' : ''}>
              <CardContent className="flex flex-col gap-3 p-5 sm:flex-row sm:items-start sm:justify-between">
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusBadge status={i.severity} />
                    <span className="font-semibold">{label(i.type)}</span>
                    <StatusBadge status={i.status} />
                    {i.chargerAutoSuspended && <Badge tone="danger">Charger auto-suspended</Badge>}
                  </div>
                  <p className="text-sm">{i.description}</p>
                  <p className="text-xs text-slate-strong">
                    {formatDate(i.createdAt)}
                    {i.chargerId && (
                      <>
                        {' '}
                        ·{' '}
                        <Link
                          className="text-teal-strong hover:underline"
                          href={`/admin/chargers/${i.chargerId}`}
                        >
                          Charger
                        </Link>
                      </>
                    )}
                    {i.bookingId && (
                      <>
                        {' '}
                        ·{' '}
                        <Link
                          className="text-teal-strong hover:underline"
                          href={`/admin/bookings/${i.bookingId}`}
                        >
                          Booking
                        </Link>
                      </>
                    )}
                  </p>
                  {i.resolutionNotes && (
                    <p className="text-sm text-slate-strong">Notes: {i.resolutionNotes}</p>
                  )}
                </div>
                {i.status !== 'RESOLVED' && (
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => {
                      setEdit({ id: i.id, status: i.status });
                      setNotes(i.resolutionNotes ?? '');
                    }}
                  >
                    Update
                  </Button>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
      {edit && (
        <Dialog open onOpenChange={(v) => !v && setEdit(null)}>
          <DialogContent title="Update incident">
            <form
              className="space-y-4"
              onSubmit={(e) => {
                e.preventDefault();
                act.mutate(
                  () =>
                    api.admin.updateIncident(edit.id, {
                      status: edit.status,
                      resolutionNotes: notes || undefined,
                    }),
                  { onSuccess: () => setEdit(null) },
                );
              }}
            >
              <Field label="Status" htmlFor="is">
                <Select
                  id="is"
                  value={edit.status}
                  onChange={(e) => setEdit({ ...edit, status: e.target.value as IncidentStatus })}
                >
                  {Object.values(IncidentStatus).map((s) => (
                    <option key={s} value={s}>
                      {label(s)}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field
                label="Notes"
                htmlFor="in"
                hint="Required to resolve. Reinstating a suspended charger is a separate action on the charger page."
              >
                <Textarea id="in" value={notes} onChange={(e) => setNotes(e.target.value)} />
              </Field>
              <div className="flex justify-end gap-2">
                <Button type="button" variant="secondary" onClick={() => setEdit(null)}>
                  Cancel
                </Button>
                <Button type="submit" loading={act.isPending}>
                  Save
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}
