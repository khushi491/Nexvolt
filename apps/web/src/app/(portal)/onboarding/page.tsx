'use client';
import { HOST_ATTESTATION_VERSION, HostType } from '@nexvolt/shared';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { PageHeader } from '@/components/common';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Field, Input, Select } from '@/components/ui/input';
import { api, errorMessage } from '@/lib/api';
import { useSession } from '@/lib/session';
import { label } from '@/lib/utils';

export default function Onboarding() {
  const router = useRouter();
  const { reload, hasRole } = useSession();
  const [displayName, setDisplayName] = useState('');
  const [hostType, setHostType] = useState<HostType>('INDIVIDUAL');
  const [authority, setAuthority] = useState(false);
  const [safety, setSafety] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Existing hosts who open this page go to their dashboard. Checked once on entry so the role
  // change caused by completing onboarding below doesn't race the redirect to the profile page.
  const alreadyHost = useRef(hasRole('HOST'));
  useEffect(() => {
    if (alreadyHost.current) router.replace('/host');
  }, [router]);
  if (alreadyHost.current) return null;
  return (
    <div className="max-w-2xl">
      <PageHeader
        title="Become a Nexvolt host"
        description="Share your charger with verified drivers. Listings go live only after Nexvolt reviews your identity, property authorisation and electrical safety documents."
      />
      <Card>
        <CardContent className="p-6">
          <form
            className="space-y-5"
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              setError(null);
              try {
                await api.hosts.onboard({
                  displayName,
                  hostType,
                  attestAuthority: true,
                  attestElectricalSafety: true,
                  attestationVersion: HOST_ATTESTATION_VERSION,
                });
                await reload();
                router.replace('/host/profile?welcome=1');
              } catch (x) {
                setError(errorMessage(x));
              } finally {
                setBusy(false);
              }
            }}
          >
            <Field
              label="Display name"
              htmlFor="dn"
              hint="Shown to drivers, e.g. “Meera’s driveway charger”"
            >
              <Input
                id="dn"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                minLength={2}
                maxLength={80}
                required
              />
            </Field>
            <Field label="You are" htmlFor="ht">
              <Select
                id="ht"
                value={hostType}
                onChange={(e) => setHostType(e.target.value as HostType)}
              >
                {Object.values(HostType).map((t) => (
                  <option key={t} value={t}>
                    {label(t)}
                  </option>
                ))}
              </Select>
            </Field>
            <fieldset className="space-y-3 rounded-md border border-line p-4">
              <legend className="px-1 text-sm font-semibold text-navy">Declarations</legend>
              <label className="flex items-start gap-3 text-sm">
                <input
                  type="checkbox"
                  className="mt-1 h-4 w-4 accent-[#0B7A6E]"
                  checked={authority}
                  onChange={(e) => setAuthority(e.target.checked)}
                />
                <span>
                  I have the legal right (as owner, or with written permission from the owner /
                  society / landlord) to offer EV charging and parking at the premises I list.
                </span>
              </label>
              <label className="flex items-start gap-3 text-sm">
                <input
                  type="checkbox"
                  className="mt-1 h-4 w-4 accent-[#0B7A6E]"
                  checked={safety}
                  onChange={(e) => setSafety(e.target.checked)}
                />
                <span>
                  My charger was installed by a qualified electrician, is maintained in safe working
                  order, and I will pause my listing immediately if it becomes unsafe.
                </span>
              </label>
              <p className="text-xs text-slate-strong">
                Declarations v{HOST_ATTESTATION_VERSION}. These do not replace document checks;
                Nexvolt will still ask for proof before any listing is verified.
              </p>
            </fieldset>
            {error && (
              <p role="alert" className="text-sm font-medium text-danger-strong">
                {error}
              </p>
            )}
            <Button
              type="submit"
              loading={busy}
              disabled={!authority || !safety || displayName.trim().length < 2}
            >
              Continue
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
