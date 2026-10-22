import { Injectable } from '@nestjs/common';
import {
  DEFAULT_SETTINGS,
  SETTING_DESCRIPTIONS,
  SETTING_KEYS,
  type PlatformSettings,
  type SettingKey,
} from '@nexvolt/shared';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import type { AuthUser } from '../../common/auth/auth-user';
import type { RequestMeta } from '../../common/auth/decorators';
import { AuditService } from '../../common/audit/audit.service';
import { AppError } from '../../common/errors/app-error';
import { PrismaService } from '../../common/prisma/prisma.service';

const bps = z.number().int().min(0).max(10_000);
const minor = z.number().int().min(0).max(100_000_000);
const minutes = z
  .number()
  .int()
  .min(0)
  .max(60 * 24 * 7);
const tiers = z
  .array(z.object({ minMinutesBeforeStart: z.number().int().min(0), refundBps: bps }))
  .max(5);

/** Validators for admin-editable settings. Anything not listed here cannot be changed. */
const VALIDATORS: Record<SettingKey, z.ZodTypeAny> = {
  commissionBps: bps.max(5000),
  driverServiceFeeBps: bps.max(3000),
  serviceFeeTaxBps: bps.max(5000),
  gatewayFeeBearer: z.enum(['HOST', 'PLATFORM']),
  kwhPricingEnabled: z.boolean(),
  minHourlyPriceMinor: minor,
  maxHourlyPriceMinor: minor,
  minKwhPriceMinor: minor,
  maxKwhPriceMinor: minor,
  holdMinutes: minutes.min(2).max(60),
  paymentWindowMinutes: minutes.min(5).max(60),
  hostApprovalWindowMinutes: minutes.min(15).max(24 * 60),
  accessRevealMinutesBefore: minutes.max(48 * 60),
  noShowGraceMinutes: minutes.min(5).max(180),
  disputeWindowHours: z
    .number()
    .int()
    .min(1)
    .max(24 * 14),
  meterToleranceWh: z.number().int().min(0).max(5000),
  meterToleranceBps: bps.max(2000),
  meterPlausibilityHeadroomBps: bps.max(5000),
  estimateLoadFactorBps: bps.min(1000),
  minLeadTimeMinutes: minutes.max(24 * 60),
  maxAdvanceBookingDays: z.number().int().min(1).max(90),
  slotStepMinutes: z.union([z.literal(15), z.literal(30), z.literal(60)]),
  cancellationTiers: z.object({ FLEXIBLE: tiers, MODERATE: tiers, STRICT: tiers }),
  autoSuspendOnCriticalIncident: z.boolean(),
};

const CACHE_MS = 5_000;

@Injectable()
export class SettingsService {
  private cache: { at: number; value: PlatformSettings } | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async get(): Promise<PlatformSettings> {
    if (this.cache && Date.now() - this.cache.at < CACHE_MS) return this.cache.value;
    const rows = await this.prisma.platformSetting.findMany();
    const merged: PlatformSettings = { ...DEFAULT_SETTINGS };
    for (const row of rows) {
      if (!(SETTING_KEYS as string[]).includes(row.key)) continue;
      const key = row.key as SettingKey;
      const parsed = VALIDATORS[key].safeParse(row.value);
      if (parsed.success) (merged as unknown as Record<string, unknown>)[key] = parsed.data;
    }
    this.cache = { at: Date.now(), value: merged };
    return merged;
  }

  invalidate(): void {
    this.cache = null;
  }

  async list() {
    const current = await this.get();
    const rows = await this.prisma.platformSetting.findMany();
    return SETTING_KEYS.map((key) => ({
      key,
      value: current[key],
      defaultValue: DEFAULT_SETTINGS[key],
      description: SETTING_DESCRIPTIONS[key],
      overridden: rows.some((r) => r.key === key),
      updatedAt: rows.find((r) => r.key === key)?.updatedAt ?? null,
    }));
  }

  async update(key: string, value: unknown, reason: string, actor: AuthUser, meta: RequestMeta) {
    if (!(SETTING_KEYS as string[]).includes(key)) throw AppError.notFound('Setting');
    const k = key as SettingKey;
    const parsed = VALIDATORS[k].safeParse(value);
    if (!parsed.success) {
      throw AppError.unprocessable(
        'INVALID_SETTING',
        parsed.error.issues[0]?.message ?? 'Invalid value',
      );
    }
    const before = (await this.get())[k];
    const next = { ...(await this.get()), [k]: parsed.data } as PlatformSettings;
    if (
      next.minHourlyPriceMinor > next.maxHourlyPriceMinor ||
      next.minKwhPriceMinor > next.maxKwhPriceMinor
    ) {
      throw AppError.unprocessable('INVALID_SETTING', 'Minimum price cannot exceed maximum price');
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.platformSetting.upsert({
        where: { key },
        create: {
          key,
          value: parsed.data as Prisma.InputJsonValue,
          description: SETTING_DESCRIPTIONS[k],
          updatedById: actor.id,
        },
        update: { value: parsed.data as Prisma.InputJsonValue, updatedById: actor.id },
      });
      await this.audit.log(
        {
          actor,
          action: 'setting.update',
          resourceType: 'PlatformSetting',
          resourceId: key,
          reason,
          oldValue: before,
          newValue: parsed.data,
          meta,
        },
        tx,
      );
    });
    this.invalidate();
    return { key, value: parsed.data };
  }
}
