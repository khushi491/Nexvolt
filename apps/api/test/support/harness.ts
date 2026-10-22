import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { Prisma, PrismaClient, type Role } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { AppModule } from '../../src/app.module';
import { CryptoService } from '../../src/common/crypto/crypto.service';
import { PrismaService } from '../../src/common/prisma/prisma.service';
import { env } from '../../src/config/env';
import {
  PaymentProviderRegistry,
  PROVIDER_REGISTRY,
} from '../../src/modules/payments/providers/provider-registry';
import { FakeRazorpay } from './fake-razorpay';

export interface TestCtx {
  app: INestApplication;
  prisma: PrismaService;
  jwt: JwtService;
  crypto: CryptoService;
  razorpay: FakeRazorpay | null;
  http: () => ReturnType<typeof request>;
}

export async function createTestApp(opts: { razorpay?: boolean } = {}): Promise<TestCtx> {
  const razorpay = opts.razorpay ? new FakeRazorpay() : null;
  const registry = new PaymentProviderRegistry(env());
  if (razorpay) (registry as unknown as { razorpay: FakeRazorpay }).razorpay = razorpay;
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(PROVIDER_REGISTRY)
    .useValue(registry)
    .compile();
  const app = moduleRef.createNestApplication({ rawBody: true, logger: false });
  app.setGlobalPrefix('api/v1');
  await app.init();
  return {
    app,
    prisma: app.get(PrismaService),
    jwt: app.get(JwtService),
    crypto: app.get(CryptoService),
    razorpay,
    http: () => request(app.getHttpServer()),
  };
}

export async function resetDb(prisma: PrismaClient): Promise<void> {
  const tables = await prisma.$queryRaw<Array<{ tablename: string }>>`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename NOT IN ('_prisma_migrations', 'spatial_ref_sys')`;
  await prisma.$executeRawUnsafe(
    `TRUNCATE ${tables.map((t) => `"${t.tablename}"`).join(', ')} CASCADE`,
  );
}

let phoneSeq = 0;
export function testPhone(): string {
  phoneSeq++;
  return `+9198${String(Date.now()).slice(-5)}${String(phoneSeq).padStart(3, '0')}`;
}

export async function createUser(
  ctx: TestCtx,
  roles: Role[] = ['DRIVER'],
  extra: Partial<Prisma.UserCreateInput> = {},
) {
  const user = await ctx.prisma.user.create({
    data: {
      phone: testPhone(),
      name: `Test ${roles.join('/')}`,
      roles,
      consentAcceptedAt: new Date(),
      consentVersion: '2026-10-v1',
      driverProfile: { create: {} },
      ...extra,
    },
  });
  const token = await ctx.jwt.signAsync({ sub: user.id, typ: 'access' });
  return { user, token, auth: { Authorization: `Bearer ${token}` } };
}

export async function createVerifiedHost(ctx: TestCtx) {
  const u = await createUser(ctx, ['DRIVER', 'HOST']);
  const host = await ctx.prisma.hostProfile.create({
    data: {
      userId: u.user.id,
      displayName: 'Test Host',
      hostType: 'INDIVIDUAL',
      kycStatus: 'VERIFIED',
      verifiedAt: new Date(),
      payoutAccountStatus: 'ACTIVE',
      attestationAcceptedAt: new Date(),
      attestationVersion: '2026-10-v1',
    },
  });
  return { ...u, host };
}

export interface ChargerOpts {
  lat?: number;
  lng?: number;
  connectors?: Array<[string, number]>;
  currentType?: 'AC' | 'DC';
  approvalMode?: 'AUTOMATIC' | 'MANUAL';
  status?: 'VERIFIED' | 'PENDING_REVIEW' | 'DRAFT' | 'SUSPENDED';
  isPublished?: boolean;
  priceMinor?: number;
  bufferMinutes?: number;
  title?: string;
}

export async function createCharger(ctx: TestCtx, hostId: string, o: ChargerOpts = {}) {
  const lat = o.lat ?? 12.9719;
  const lng = o.lng ?? 77.6412;
  const status = o.status ?? 'VERIFIED';
  const c = await ctx.prisma.charger.create({
    data: {
      hostId,
      title: o.title ?? 'Test charger',
      status,
      isPublished: o.isPublished ?? status === 'VERIFIED',
      verifiedAt: status === 'VERIFIED' ? new Date() : null,
      currentType: o.currentType ?? 'AC',
      maxPowerKw: new Prisma.Decimal(
        Math.max(...(o.connectors ?? [['TYPE_2', 7.2]]).map(([, p]) => p)),
      ),
      parkingType: 'PRIVATE_DRIVEWAY',
      pricingUnit: 'PER_HOUR',
      unitPriceMinor: o.priceMinor ?? 12_000,
      approvalMode: o.approvalMode ?? 'AUTOMATIC',
      cancellationPolicy: 'MODERATE',
      bufferMinutes: o.bufferMinutes ?? 15,
      addressLine1: ctx.crypto.encrypt('1 Private Road'),
      accessInstructions: ctx.crypto.encrypt('Secret gate code 9999'),
      locality: 'Testpur',
      city: 'Bengaluru',
      state: 'Karnataka',
      pincode: '560001',
      publicLat: new Prisma.Decimal(lat + 0.003),
      publicLng: new Prisma.Decimal(lng),
      connectors: {
        create: (o.connectors ?? [['TYPE_2', 7.2]]).map(([t, p]) => ({
          connectorType: t as never,
          powerKw: new Prisma.Decimal(p),
        })),
      },
      availabilityRules: {
        create: [0, 1, 2, 3, 4, 5, 6].map((d) => ({
          dayOfWeek: d,
          startMinute: 0,
          endMinute: 1440,
        })),
      },
    },
  });
  await ctx.prisma
    .$executeRaw`UPDATE chargers SET location = ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography,
    "publicLocation" = ST_SetSRID(ST_MakePoint(${lng}, ${lat + 0.003}), 4326)::geography WHERE id = ${c.id}::uuid`;
  return c;
}

export async function createVehicle(
  ctx: TestCtx,
  ownerId: string,
  connectors: string[] = ['TYPE_2', 'CCS2'],
  maxAcKw = 7.2,
  maxDcKw: number | null = 50,
) {
  return ctx.prisma.vehicle.create({
    data: {
      ownerId,
      manufacturer: 'Tata',
      model: 'Nexon EV',
      maxAcKw: new Prisma.Decimal(maxAcKw),
      maxDcKw: maxDcKw == null ? null : new Prisma.Decimal(maxDcKw),
      isDefault: true,
      connectors: { create: connectors.map((t) => ({ connectorType: t as never })) },
    },
  });
}

/** A future, step-aligned 60-minute slot `daysAhead` days out at `hour`:00 UTC. */
export function slot(daysAhead = 2, hour = 6, durationMinutes = 60) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + daysAhead);
  d.setUTCHours(hour, 0, 0, 0);
  return {
    startAt: d.toISOString(),
    endAt: new Date(d.getTime() + durationMinutes * 60_000).toISOString(),
  };
}

export const idem = () => ({ 'Idempotency-Key': randomUUID() });

export async function bookAndPayDemo(
  ctx: TestCtx,
  driver: { auth: Record<string, string> },
  chargerId: string,
  vehicleId: string,
  s = slot(),
) {
  const b = await ctx
    .http()
    .post('/api/v1/bookings')
    .set(driver.auth)
    .set(idem())
    .send({ chargerId, vehicleId, connectorType: 'TYPE_2', ...s, acceptPolicies: true });
  if (b.status !== 201) throw new Error(`booking failed: ${JSON.stringify(b.body)}`);
  await ctx
    .http()
    .post('/api/v1/payments/orders')
    .set(driver.auth)
    .set(idem())
    .send({ bookingId: b.body.id })
    .expect(201);
  const pay = await ctx
    .http()
    .post('/api/v1/payments/demo/complete')
    .set(driver.auth)
    .send({ bookingId: b.body.id, outcome: 'SUCCESS' })
    .expect(200);
  return { booking: b.body, result: pay.body };
}

/** A slot starting on the next whole hour at least `minHours` from now (within the address-reveal window). */
export function soonSlot(minHours = 2, durationMinutes = 60) {
  const d = new Date(Date.now() + minHours * 3600_000);
  d.setUTCMinutes(0, 0, 0);
  d.setUTCHours(d.getUTCHours() + 1);
  return {
    startAt: d.toISOString(),
    endAt: new Date(d.getTime() + durationMinutes * 60_000).toISOString(),
  };
}
