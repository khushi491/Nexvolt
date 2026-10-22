'use client';
import { DocumentType, HostType } from '@nexvolt/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FileUp } from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { formatDate, PageHeader, StatusBadge, VerificationBadge } from '@/components/common';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Field, Input, Select, Textarea } from '@/components/ui/input';
import { useToast } from '@/components/ui/toast';
import { api, errorMessage } from '@/lib/api';
import { useSession } from '@/lib/session';
import { uploadDocument } from '@/lib/upload';
import { label } from '@/lib/utils';

function ProfileInner() {
  const welcome = useSearchParams().get('welcome');
  const { user, reload } = useSession();
  const host = user!.hostProfile!;
  const toast = useToast();
  const qc = useQueryClient();
  const docs = useQuery({ queryKey: ['my-documents'], queryFn: () => api.documents.list() });
  const [form, setForm] = useState({
    displayName: host.displayName,
    hostType: host.hostType,
    bio: host.bio ?? '',
  });
  const [uploading, setUploading] = useState(false);

  const save = useMutation({
    mutationFn: () =>
      api.hosts.update({
        displayName: form.displayName,
        hostType: form.hostType,
        bio: form.bio || null,
      }),
    onSuccess: async () => {
      await reload();
      toast({ tone: 'success', message: 'Profile saved' });
    },
    onError: (e) => toast({ tone: 'error', message: errorMessage(e) }),
  });
  const submitKyc = useMutation({
    mutationFn: () => api.hosts.submitKyc(),
    onSuccess: async () => {
      await reload();
      toast({ tone: 'success', message: 'Submitted for review. We’ll notify you when it’s done.' });
    },
    onError: (e) => toast({ tone: 'error', message: errorMessage(e) }),
  });
  const idDocs = (docs.data ?? []).filter((d) => d.docType === DocumentType.IDENTITY_PROOF);

  return (
    <>
      <PageHeader
        title="Host profile"
        description="Your public host details and identity verification."
      />
      {welcome && (
        <p className="mb-6 rounded-md border border-teal bg-teal-soft p-4 text-sm text-navy">
          You’re registered as a host. Next: upload an identity document for verification, then add
          your charger.
        </p>
      )}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Public details</CardTitle>
            <CardDescription>Drivers see your display name and type.</CardDescription>
          </CardHeader>
          <CardContent>
            <form
              className="space-y-4"
              onSubmit={(e) => {
                e.preventDefault();
                save.mutate();
              }}
            >
              <Field label="Display name" htmlFor="dn">
                <Input
                  id="dn"
                  value={form.displayName}
                  onChange={(e) => setForm({ ...form, displayName: e.target.value })}
                  required
                  minLength={2}
                />
              </Field>
              <Field label="Host type" htmlFor="ht">
                <Select
                  id="ht"
                  value={form.hostType}
                  onChange={(e) => setForm({ ...form, hostType: e.target.value as HostType })}
                >
                  {Object.values(HostType).map((t) => (
                    <option key={t} value={t}>
                      {label(t)}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="About (optional)" htmlFor="bio">
                <Textarea
                  id="bio"
                  value={form.bio}
                  onChange={(e) => setForm({ ...form, bio: e.target.value })}
                  maxLength={500}
                />
              </Field>
              <Button type="submit" loading={save.isPending}>
                Save
              </Button>
            </form>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Identity verification</CardTitle>
              <VerificationBadge verified={host.kycStatus === 'VERIFIED'} />
            </div>
            <CardDescription>
              Upload a government ID (PDF/JPEG/PNG, ≤10 MB). A Nexvolt reviewer checks it manually —
              no automated KYC is connected yet, and uploading alone never marks you verified.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm">
              Status: <StatusBadge status={host.kycStatus} />
            </p>
            <label className="flex min-h-[44px] cursor-pointer items-center justify-center gap-2 rounded-md border border-dashed border-line-strong p-4 text-sm font-medium text-teal-strong hover:bg-background">
              <FileUp className="h-4 w-4" /> {uploading ? 'Uploading…' : 'Upload identity document'}
              <input
                type="file"
                className="sr-only"
                accept="application/pdf,image/jpeg,image/png"
                disabled={uploading}
                onChange={async (e) => {
                  const f = e.target.files?.[0];
                  e.target.value = '';
                  if (!f) return;
                  setUploading(true);
                  try {
                    await uploadDocument(f, 'IDENTITY_PROOF');
                    await qc.invalidateQueries({ queryKey: ['my-documents'] });
                    toast({ tone: 'success', message: 'Document uploaded and checked' });
                  } catch (x) {
                    toast({ tone: 'error', message: errorMessage(x) });
                  } finally {
                    setUploading(false);
                  }
                }}
              />
            </label>
            {idDocs.length > 0 && (
              <ul className="space-y-2 text-sm">
                {idDocs.map((d) => (
                  <li
                    key={d.id}
                    className="flex items-center justify-between rounded-md bg-background px-3 py-2"
                  >
                    <span className="truncate">
                      {d.fileName}{' '}
                      <span className="text-xs text-slate-strong">
                        · {formatDate(d.createdAt, false)}
                      </span>
                    </span>
                    <StatusBadge status={d.status} />
                  </li>
                ))}
              </ul>
            )}
            {(host.kycStatus === 'NOT_STARTED' || host.kycStatus === 'REJECTED') && (
              <Button
                onClick={() => submitKyc.mutate()}
                loading={submitKyc.isPending}
                disabled={
                  !idDocs.some((d) => d.status === 'PENDING_REVIEW' || d.status === 'ACCEPTED')
                }
              >
                Submit for verification
              </Button>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}

export default function HostProfilePage() {
  return (
    <Suspense>
      <ProfileInner />
    </Suspense>
  );
}
