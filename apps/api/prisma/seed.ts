/**
 * Seed FICTIONAL sample data for local demos. Every user and charger is flagged isSample
 * and shown as "Sample" in the UI. Locations are invented points in Bengaluru, not real chargers.
 * Vehicle catalog specs are indicative only and must be verified against manufacturer data.
 */
import { PrismaClient, Prisma } from '@prisma/client';
import { createCipheriv, randomBytes } from 'node:crypto';
import { offsetLocation } from '@nexvolt/shared';
import 'dotenv/config';

const prisma = new PrismaClient();
const key = Buffer.from(process.env.PII_ENCRYPTION_KEY ?? '', 'base64');
if (key.length !== 32) throw new Error('PII_ENCRYPTION_KEY missing — copy apps/api/.env.example to .env');

function enc(plain: string | null): string | null {
  if (plain == null) return null;
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', key, iv);
  const body = Buffer.concat([c.update(plain, 'utf8'), c.final()]);
  return 'enc:v1:' + Buffer.concat([iv, c.getAuthTag(), body]).toString('base64');
}

export const DEMO_ACCOUNTS = {
  admin: '+919000000001',
  opsAdmin: '+919000000004',
  host: '+919000000002',
  driver: '+919000000003',
};

const CATALOG = [
  { manufacturer: 'Tata', model: 'Nexon EV', variant: 'Long Range', connectors: ['CCS2', 'TYPE_2'], maxAcKw: 7.2, maxDcKw: 50, batteryKwh: 40.5 },
  { manufacturer: 'Tata', model: 'Tiago EV', variant: 'LR', connectors: ['CCS2', 'TYPE_2'], maxAcKw: 7.2, maxDcKw: 25, batteryKwh: 24 },
  { manufacturer: 'MG', model: 'ZS EV', variant: null, connectors: ['CCS2', 'TYPE_2'], maxAcKw: 7.4, maxDcKw: 50, batteryKwh: 50.3 },
  { manufacturer: 'MG', model: 'Comet EV', variant: null, connectors: ['TYPE_2'], maxAcKw: 3.3, maxDcKw: null, batteryKwh: 17.3 },
  { manufacturer: 'Mahindra', model: 'XUV400', variant: 'EL Pro', connectors: ['CCS2', 'TYPE_2'], maxAcKw: 7.2, maxDcKw: 50, batteryKwh: 39.4 },
  { manufacturer: 'Hyundai', model: 'Ioniq 5', variant: null, connectors: ['CCS2', 'TYPE_2'], maxAcKw: 11, maxDcKw: 150, batteryKwh: 72.6 },
  { manufacturer: 'BYD', model: 'Atto 3', variant: null, connectors: ['CCS2', 'TYPE_2'], maxAcKw: 7, maxDcKw: 80, batteryKwh: 60.5 },
] as const;

const CHARGERS = [
  { title: 'Covered 7 kW home charger near 100 Ft Road', locality: 'Indiranagar', lat: 12.9719, lng: 77.6412, current: 'AC', power: 7.2, connectors: [['TYPE_2', 7.2]], price: 12000, parking: 'PRIVATE_DRIVEWAY', approval: 'AUTOMATIC', policy: 'FLEXIBLE' },
  { title: 'Gated society basement Type 2 + 15A socket', locality: 'Koramangala', lat: 12.9352, lng: 77.6245, current: 'AC', power: 7.4, connectors: [['TYPE_2', 7.4], ['DOMESTIC_15A', 3.3]], price: 10000, parking: 'BASEMENT', approval: 'MANUAL', policy: 'MODERATE' },
  { title: 'Office lot 22 kW AC after business hours', locality: 'Whitefield', lat: 12.9698, lng: 77.75, current: 'AC', power: 22, connectors: [['TYPE_2', 22]], price: 18000, parking: 'OPEN_LOT', approval: 'AUTOMATIC', policy: 'STRICT' },
  { title: 'Compact 3.3 kW socket — ideal for small EVs', locality: 'Jayanagar', lat: 12.925, lng: 77.5938, current: 'AC', power: 3.3, connectors: [['DOMESTIC_15A', 3.3]], price: 5000, parking: 'STREET_ADJACENT', approval: 'AUTOMATIC', policy: 'FLEXIBLE' },
] as const;

async function main() {
  console.log('Seeding FICTIONAL sample data…');
  for (const m of CATALOG) {
    await prisma.vehicleModel.upsert({
      where: { manufacturer_model_variant: { manufacturer: m.manufacturer, model: m.model, variant: m.variant as string } },
      create: { ...m, variant: m.variant, connectors: [...m.connectors], maxAcKw: new Prisma.Decimal(m.maxAcKw), maxDcKw: m.maxDcKw == null ? null : new Prisma.Decimal(m.maxDcKw), batteryKwh: new Prisma.Decimal(m.batteryKwh) },
      update: {},
    }).catch(async () => {
      // variant null breaks compound-unique upsert; fall back to find-or-create
      const exists = await prisma.vehicleModel.findFirst({ where: { manufacturer: m.manufacturer, model: m.model } });
      if (!exists) await prisma.vehicleModel.create({ data: { ...m, variant: m.variant, connectors: [...m.connectors], maxAcKw: new Prisma.Decimal(m.maxAcKw), maxDcKw: m.maxDcKw == null ? null : new Prisma.Decimal(m.maxDcKw), batteryKwh: new Prisma.Decimal(m.batteryKwh) } });
    });
  }

  const consent = { consentAcceptedAt: new Date(), consentVersion: '2026-10-v1', isSample: true };
  const admin = await prisma.user.upsert({
    where: { phone: DEMO_ACCOUNTS.admin },
    create: { phone: DEMO_ACCOUNTS.admin, name: 'Asha Admin (Sample)', roles: ['ADMIN', 'DRIVER'], ...consent, driverProfile: { create: {} } },
    update: {},
  });
  await prisma.user.upsert({
    where: { phone: DEMO_ACCOUNTS.opsAdmin },
    create: { phone: DEMO_ACCOUNTS.opsAdmin, name: 'Arjun Ops Admin (Sample)', roles: ['ADMIN'], ...consent, driverProfile: { create: {} } },
    update: {},
  });
  const hostUser = await prisma.user.upsert({
    where: { phone: DEMO_ACCOUNTS.host },
    create: { phone: DEMO_ACCOUNTS.host, name: 'Harish Host (Sample)', roles: ['DRIVER', 'HOST'], ...consent, driverProfile: { create: {} } },
    update: {},
  });
  const driver = await prisma.user.upsert({
    where: { phone: DEMO_ACCOUNTS.driver },
    create: { phone: DEMO_ACCOUNTS.driver, name: 'Divya Driver (Sample)', roles: ['DRIVER'], ...consent, driverProfile: { create: {} } },
    update: {},
  });

  // The sample host is verified via a recorded (sample) admin decision, mirroring the real flow.
  const host = await prisma.hostProfile.upsert({
    where: { userId: hostUser.id },
    create: {
      userId: hostUser.id,
      displayName: 'Harish (Sample host)',
      hostType: 'INDIVIDUAL',
      kycStatus: 'VERIFIED',
      verifiedAt: new Date(),
      verifiedById: admin.id,
      payoutAccountStatus: 'ACTIVE',
      attestationAcceptedAt: new Date(),
      attestationVersion: '2026-10-v1',
    },
    update: {},
  });

  const nexon = await prisma.vehicleModel.findFirstOrThrow({ where: { model: 'Nexon EV' } });
  if (!(await prisma.vehicle.findFirst({ where: { ownerId: driver.id } }))) {
    await prisma.vehicle.create({
      data: {
        ownerId: driver.id, catalogModelId: nexon.id, manufacturer: 'Tata', model: 'Nexon EV', nickname: 'My Nexon', isDefault: true,
        maxAcKw: new Prisma.Decimal(7.2), maxDcKw: new Prisma.Decimal(50),
        connectors: { create: [{ connectorType: 'CCS2' }, { connectorType: 'TYPE_2' }] },
      },
    });
  }

  for (const [i, c] of CHARGERS.entries()) {
    if (await prisma.charger.findFirst({ where: { hostId: host.id, title: c.title } })) continue;
    const pub = offsetLocation({ lat: c.lat, lng: c.lng }, 250 + i * 60, (i * 97 * Math.PI) / 180);
    const ch = await prisma.charger.create({
      data: {
        hostId: host.id, title: c.title, description: 'FICTIONAL SAMPLE LISTING for demos — not a real charger.',
        status: 'VERIFIED', isPublished: true, verifiedAt: new Date(), verifiedById: admin.id, isSample: true,
        currentType: c.current, maxPowerKw: new Prisma.Decimal(c.power), chargerMake: 'Sample Make', chargerModel: 'Sample 7kW Wallbox',
        meterType: 'CHARGER_DISPLAY', parkingType: c.parking, parkingNotes: 'Sample parking notes.',
        accessInstructions: enc('SAMPLE: Ring the bell at gate 2; the security desk has your booking code.'),
        safetyNotes: 'Do not use if the cable or plug looks damaged. Report issues immediately.',
        pricingUnit: 'PER_HOUR', unitPriceMinor: c.price, cancellationPolicy: c.policy, approvalMode: c.approval,
        addressLine1: enc(`${100 + i} Sample Street`)!, addressLine2: null,
        locality: c.locality, city: 'Bengaluru', state: 'Karnataka', pincode: '560038',
        publicLat: new Prisma.Decimal(pub.lat.toFixed(6)), publicLng: new Prisma.Decimal(pub.lng.toFixed(6)),
        connectors: { create: c.connectors.map(([t, p]) => ({ connectorType: t, powerKw: new Prisma.Decimal(p) })) },
        availabilityRules: { create: [0, 1, 2, 3, 4, 5, 6].map((d) => ({ dayOfWeek: d, startMinute: 6 * 60, endMinute: 23 * 60 })) },
        verifications: { create: { status: 'APPROVED', reviewerId: admin.id, decidedAt: new Date(), notes: 'Sample approval (seed data)' } },
      },
    });
    await prisma.$executeRaw`UPDATE chargers SET
      location = ST_SetSRID(ST_MakePoint(${c.lng}, ${c.lat}), 4326)::geography,
      "publicLocation" = ST_SetSRID(ST_MakePoint(${pub.lng}, ${pub.lat}), 4326)::geography
      WHERE id = ${ch.id}::uuid`;
  }
  console.log('Demo accounts (OTP emulator code from OTP_EMULATOR_FIXED_CODE):');
  console.log(`  admin  ${DEMO_ACCOUNTS.admin}\n  admin2 ${DEMO_ACCOUNTS.opsAdmin} (used by API-level E2E tests)\n  host   ${DEMO_ACCOUNTS.host}\n  driver ${DEMO_ACCOUNTS.driver}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
