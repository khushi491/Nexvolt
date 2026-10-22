'use client';
import {
  CancellationPolicy,
  CANCELLATION_POLICY_COPY,
  CONNECTOR_LABELS,
  ConnectorType,
  CreateChargerSchema,
  INDIAN_STATES,
  MeterType,
  ParkingType,
  rupeesToPaise,
  type ChargerManageDto,
  type CreateChargerInput,
} from '@nexvolt/shared';
import { LocateFixed, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Field, Input, Select, Textarea } from '@/components/ui/input';
import { label } from '@/lib/utils';

type FormState = {
  title: string;
  description: string;
  currentType: 'AC' | 'DC';
  maxPowerKw: string;
  connectors: Array<{ connectorType: ConnectorType; powerKw: string }>;
  chargerMake: string;
  chargerModel: string;
  serialNumber: string;
  meterType: MeterType;
  smartCapable: boolean;
  integrationProvider: string;
  parkingType: ParkingType;
  parkingNotes: string;
  wheelchairAccessible: boolean;
  accessInstructions: string;
  safetyNotes: string;
  pricingUnit: 'PER_HOUR' | 'PER_KWH';
  price: string;
  cancellationPolicy: CancellationPolicy;
  line1: string;
  line2: string;
  locality: string;
  city: string;
  state: string;
  pincode: string;
  lat: string;
  lng: string;
};

function initial(c?: ChargerManageDto): FormState {
  return {
    title: c?.title ?? '',
    description: c?.description ?? '',
    currentType: c?.currentType ?? 'AC',
    maxPowerKw: c ? String(c.maxPowerKw) : '7.2',
    connectors: c?.connectors.map((k) => ({
      connectorType: k.connectorType,
      powerKw: String(k.powerKw),
    })) ?? [{ connectorType: 'TYPE_2', powerKw: '7.2' }],
    chargerMake: c?.chargerMake ?? '',
    chargerModel: c?.chargerModel ?? '',
    serialNumber: c?.serialNumber ?? '',
    meterType: c?.meterType ?? 'CHARGER_DISPLAY',
    smartCapable: c?.smartCapable ?? false,
    integrationProvider: c?.integrationProvider ?? '',
    parkingType: c?.parkingType ?? 'PRIVATE_DRIVEWAY',
    parkingNotes: c?.parkingNotes ?? '',
    wheelchairAccessible: c?.wheelchairAccessible ?? false,
    accessInstructions: c?.accessInstructions ?? '',
    safetyNotes: c?.safetyNotes ?? '',
    pricingUnit: c?.pricingUnit ?? 'PER_HOUR',
    price: c ? (c.unitPriceMinor / 100).toFixed(2) : '100',
    cancellationPolicy: c?.cancellationPolicy ?? 'MODERATE',
    line1: c?.address.line1 ?? '',
    line2: c?.address.line2 ?? '',
    locality: c?.address.locality ?? '',
    city: c?.address.city ?? '',
    state: c?.address.state ?? 'Karnataka',
    pincode: c?.address.pincode ?? '',
    lat: c ? String(c.exactLocation.lat) : '',
    lng: c ? String(c.exactLocation.lng) : '',
  };
}

export function ChargerForm({
  charger,
  submitLabel,
  onSubmit,
  busy,
}: {
  charger?: ChargerManageDto;
  submitLabel: string;
  busy?: boolean;
  onSubmit: (input: CreateChargerInput) => void;
}) {
  const [f, setF] = useState<FormState>(() => initial(charger));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setF((x) => ({ ...x, [k]: v }));
  const kwhAllowed = charger?.kwhPricingAllowed ?? false;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    let priceMinor = 0;
    try {
      priceMinor = rupeesToPaise(f.price);
    } catch {
      setErrors({ price: 'Enter a price like 120 or 120.50' });
      return;
    }
    const input: CreateChargerInput = {
      title: f.title,
      description: f.description || null,
      currentType: f.currentType,
      maxPowerKw: Number(f.maxPowerKw),
      connectors: f.connectors.map((k) => ({
        connectorType: k.connectorType,
        powerKw: Number(k.powerKw),
      })),
      chargerMake: f.chargerMake || null,
      chargerModel: f.chargerModel || null,
      serialNumber: f.serialNumber || null,
      meterType: f.meterType,
      smartCapable: f.smartCapable,
      integrationProvider: f.integrationProvider || null,
      parkingType: f.parkingType,
      parkingNotes: f.parkingNotes || null,
      wheelchairAccessible: f.wheelchairAccessible,
      accessInstructions: f.accessInstructions || null,
      safetyNotes: f.safetyNotes || null,
      pricingUnit: f.pricingUnit,
      unitPriceMinor: priceMinor,
      cancellationPolicy: f.cancellationPolicy,
      address: {
        line1: f.line1,
        line2: f.line2 || null,
        locality: f.locality,
        city: f.city,
        state: f.state as (typeof INDIAN_STATES)[number],
        pincode: f.pincode,
      },
      lat: Number(f.lat),
      lng: Number(f.lng),
    };
    const parsed = CreateChargerSchema.safeParse(input);
    if (!parsed.success) {
      setErrors(Object.fromEntries(parsed.error.issues.map((i) => [i.path.join('.'), i.message])));
      return;
    }
    setErrors({});
    onSubmit(input);
  };
  const err = (k: string) => errors[k];
  const errorList = Object.entries(errors);

  return (
    <form onSubmit={submit} className="space-y-6" noValidate>
      {errorList.length > 0 && (
        <div
          role="alert"
          className="rounded-md border border-danger bg-danger-soft p-4 text-sm text-danger-strong"
        >
          <p className="font-semibold">
            Please fix {errorList.length} field{errorList.length > 1 ? 's' : ''}:
          </p>
          <ul className="mt-1 list-disc pl-5">
            {errorList.slice(0, 6).map(([k, v]) => (
              <li key={k}>
                {k}: {v}
              </li>
            ))}
          </ul>
        </div>
      )}
      <Card>
        <CardHeader>
          <CardTitle>Listing</CardTitle>
          <CardDescription>What drivers see before booking.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Field label="Title" htmlFor="title" error={err('title')}>
              <Input
                id="title"
                value={f.title}
                onChange={(e) => set('title', e.target.value)}
                placeholder="Covered 7 kW home charger near metro"
              />
            </Field>
          </div>
          <div className="sm:col-span-2">
            <Field label="Description" htmlFor="desc">
              <Textarea
                id="desc"
                value={f.description}
                onChange={(e) => set('description', e.target.value)}
                maxLength={1000}
              />
            </Field>
          </div>
          <Field label="Parking type" htmlFor="pt">
            <Select
              id="pt"
              value={f.parkingType}
              onChange={(e) => set('parkingType', e.target.value as ParkingType)}
            >
              {Object.values(ParkingType).map((p) => (
                <option key={p} value={p}>
                  {label(p)}
                </option>
              ))}
            </Select>
          </Field>
          <label className="flex items-center gap-3 self-end text-sm">
            <input
              type="checkbox"
              className="h-4 w-4 accent-[#0B7A6E]"
              checked={f.wheelchairAccessible}
              onChange={(e) => set('wheelchairAccessible', e.target.checked)}
            />{' '}
            Step-free / wheelchair accessible
          </label>
          <div className="sm:col-span-2">
            <Field
              label="Parking notes (public)"
              htmlFor="pn"
              hint="e.g. height limit, covered, which bay"
            >
              <Textarea
                id="pn"
                value={f.parkingNotes}
                onChange={(e) => set('parkingNotes', e.target.value)}
              />
            </Field>
          </div>
          <div className="sm:col-span-2">
            <Field label="Safety notes (public)" htmlFor="sn">
              <Textarea
                id="sn"
                value={f.safetyNotes}
                onChange={(e) => set('safetyNotes', e.target.value)}
              />
            </Field>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Charger hardware</CardTitle>
          <CardDescription>
            Use the maximum <em>safe</em> power your installation supports, as certified by your
            electrician.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <Field label="Current type" htmlFor="ct">
            <Select
              id="ct"
              value={f.currentType}
              onChange={(e) => set('currentType', e.target.value as 'AC' | 'DC')}
            >
              <option value="AC">AC</option>
              <option value="DC">DC</option>
            </Select>
          </Field>
          <Field label="Maximum safe power (kW)" htmlFor="mp" error={err('maxPowerKw')}>
            <Input
              id="mp"
              inputMode="decimal"
              value={f.maxPowerKw}
              onChange={(e) => set('maxPowerKw', e.target.value)}
            />
          </Field>
          <div className="space-y-2 sm:col-span-2">
            <p className="text-sm font-medium">Connectors</p>
            {f.connectors.map((k, i) => (
              <div key={i} className="flex gap-2">
                <Select
                  aria-label={`Connector ${i + 1} type`}
                  value={k.connectorType}
                  onChange={(e) =>
                    set(
                      'connectors',
                      f.connectors.map((x, j) =>
                        j === i ? { ...x, connectorType: e.target.value as ConnectorType } : x,
                      ),
                    )
                  }
                >
                  {Object.values(ConnectorType).map((t) => (
                    <option key={t} value={t}>
                      {CONNECTOR_LABELS[t]}
                    </option>
                  ))}
                </Select>
                <Input
                  aria-label={`Connector ${i + 1} power kW`}
                  className="w-32"
                  inputMode="decimal"
                  value={k.powerKw}
                  onChange={(e) =>
                    set(
                      'connectors',
                      f.connectors.map((x, j) => (j === i ? { ...x, powerKw: e.target.value } : x)),
                    )
                  }
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label="Remove connector"
                  disabled={f.connectors.length === 1}
                  onClick={() =>
                    set(
                      'connectors',
                      f.connectors.filter((_, j) => j !== i),
                    )
                  }
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
            {err('connectors') && (
              <p className="text-xs font-medium text-danger-strong">{err('connectors')}</p>
            )}
            {f.connectors.length < 4 && (
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() =>
                  set('connectors', [
                    ...f.connectors,
                    { connectorType: 'TYPE_2', powerKw: f.maxPowerKw },
                  ])
                }
              >
                <Plus className="h-4 w-4" /> Add connector
              </Button>
            )}
          </div>
          <Field label="Make" htmlFor="mk">
            <Input
              id="mk"
              value={f.chargerMake}
              onChange={(e) => set('chargerMake', e.target.value)}
            />
          </Field>
          <Field label="Model" htmlFor="md">
            <Input
              id="md"
              value={f.chargerModel}
              onChange={(e) => set('chargerModel', e.target.value)}
            />
          </Field>
          <Field label="Serial number (private)" htmlFor="sr">
            <Input
              id="sr"
              value={f.serialNumber}
              onChange={(e) => set('serialNumber', e.target.value)}
            />
          </Field>
          <Field
            label="Metering"
            htmlFor="mt"
            hint="Per-kWh pricing needs a sub-meter with an accepted calibration certificate."
          >
            <Select
              id="mt"
              value={f.meterType}
              onChange={(e) => set('meterType', e.target.value as MeterType)}
            >
              {Object.values(MeterType).map((m) => (
                <option key={m} value={m}>
                  {label(m)}
                </option>
              ))}
            </Select>
          </Field>
          <label className="flex items-center gap-3 text-sm">
            <input
              type="checkbox"
              className="h-4 w-4 accent-[#0B7A6E]"
              checked={f.smartCapable}
              onChange={(e) => set('smartCapable', e.target.checked)}
            />{' '}
            Smart / networked charger
          </label>
          <Field
            label="Integration provider (optional)"
            htmlFor="ip"
            hint="Recorded for future OCPP integration. Nexvolt does not control chargers remotely in this release."
          >
            <Input
              id="ip"
              value={f.integrationProvider}
              onChange={(e) => set('integrationProvider', e.target.value)}
            />
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Pricing & policy</CardTitle>
          <CardDescription>
            Prices are in INR and must fall within Nexvolt’s current limits. Nexvolt’s commission is
            deducted from your earnings.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-3">
          <Field
            label="Pricing unit"
            htmlFor="pu"
            hint={
              kwhAllowed
                ? undefined
                : 'Per-kWh pricing is disabled until metering and regulatory checks pass.'
            }
          >
            <Select
              id="pu"
              value={f.pricingUnit}
              onChange={(e) => set('pricingUnit', e.target.value as 'PER_HOUR' | 'PER_KWH')}
            >
              <option value="PER_HOUR">Per hour</option>
              <option value="PER_KWH" disabled={!kwhAllowed}>
                Per kWh (verified meter)
              </option>
            </Select>
          </Field>
          <Field
            label={`Price (₹ ${f.pricingUnit === 'PER_HOUR' ? 'per hour' : 'per kWh'})`}
            htmlFor="pr"
            error={err('price') ?? err('unitPriceMinor')}
          >
            <Input
              id="pr"
              inputMode="decimal"
              value={f.price}
              onChange={(e) => set('price', e.target.value)}
            />
          </Field>
          <Field
            label="Cancellation policy"
            htmlFor="cp"
            hint={CANCELLATION_POLICY_COPY[f.cancellationPolicy]}
          >
            <Select
              id="cp"
              value={f.cancellationPolicy}
              onChange={(e) => set('cancellationPolicy', e.target.value as CancellationPolicy)}
            >
              {Object.values(CancellationPolicy).map((p) => (
                <option key={p} value={p}>
                  {label(p)}
                </option>
              ))}
            </Select>
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Location & access (private)</CardTitle>
          <CardDescription>
            Drivers only see an approximate area (a few hundred metres away) until they have a
            confirmed booking close to the start time.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Field label="Address line 1" htmlFor="l1" error={err('address.line1')}>
              <Input
                id="l1"
                value={f.line1}
                onChange={(e) => set('line1', e.target.value)}
                autoComplete="address-line1"
              />
            </Field>
          </div>
          <div className="sm:col-span-2">
            <Field label="Address line 2" htmlFor="l2">
              <Input
                id="l2"
                value={f.line2}
                onChange={(e) => set('line2', e.target.value)}
                autoComplete="address-line2"
              />
            </Field>
          </div>
          <Field
            label="Locality / neighbourhood (public)"
            htmlFor="lc"
            error={err('address.locality')}
          >
            <Input id="lc" value={f.locality} onChange={(e) => set('locality', e.target.value)} />
          </Field>
          <Field label="City (public)" htmlFor="cy" error={err('address.city')}>
            <Input
              id="cy"
              value={f.city}
              onChange={(e) => set('city', e.target.value)}
              autoComplete="address-level2"
            />
          </Field>
          <Field label="State" htmlFor="st">
            <Select id="st" value={f.state} onChange={(e) => set('state', e.target.value)}>
              {INDIAN_STATES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="PIN code" htmlFor="pc" error={err('address.pincode')}>
            <Input
              id="pc"
              inputMode="numeric"
              maxLength={6}
              value={f.pincode}
              onChange={(e) => set('pincode', e.target.value)}
              autoComplete="postal-code"
            />
          </Field>
          <Field label="Latitude" htmlFor="lat" error={err('lat')}>
            <Input
              id="lat"
              inputMode="decimal"
              value={f.lat}
              onChange={(e) => set('lat', e.target.value)}
            />
          </Field>
          <Field label="Longitude" htmlFor="lng" error={err('lng')}>
            <Input
              id="lng"
              inputMode="decimal"
              value={f.lng}
              onChange={(e) => set('lng', e.target.value)}
            />
          </Field>
          <div className="sm:col-span-2">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() =>
                navigator.geolocation?.getCurrentPosition((p) => {
                  set('lat', p.coords.latitude.toFixed(6));
                  set('lng', p.coords.longitude.toFixed(6));
                })
              }
            >
              <LocateFixed className="h-4 w-4" /> Use my current location
            </Button>
            <p className="mt-2 text-xs text-slate-strong">
              A map pin picker needs a Google Maps API key (not configured). Stand at the charger
              and use your current location, or paste coordinates from Google Maps.
            </p>
          </div>
          <div className="sm:col-span-2">
            <Field
              label="Access instructions (private — shared only with confirmed drivers)"
              htmlFor="ai"
            >
              <Textarea
                id="ai"
                value={f.accessInstructions}
                onChange={(e) => set('accessInstructions', e.target.value)}
                placeholder="Gate code, which security desk to speak to, where the cable is stored…"
              />
            </Field>
          </div>
        </CardContent>
      </Card>
      <div className="flex justify-end">
        <Button type="submit" size="lg" loading={busy}>
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}
