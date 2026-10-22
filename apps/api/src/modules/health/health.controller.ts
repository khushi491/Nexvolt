import { Controller, Get, Inject } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { HealthDto } from '@nexvolt/shared';
import type { Redis } from 'ioredis';
import { ENV, type Env } from '../../config/env';
import { Public } from '../../common/auth/decorators';
import { PrismaService } from '../../common/prisma/prisma.service';
import { REDIS } from '../../common/redis/redis.module';
import { PUSH_PROVIDER, type PushProvider } from '../notifications/push.provider';
import { StorageService } from '../storage/storage.service';

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    @Inject(REDIS) private readonly redis: Redis,
    @Inject(ENV) private readonly env: Env,
    @Inject(PUSH_PROVIDER) private readonly push: PushProvider,
  ) {}

  @Public()
  @Get('live')
  live() {
    return { status: 'ok' };
  }

  @Public()
  @Get()
  async health(): Promise<HealthDto> {
    const checks: HealthDto['checks'] = {};
    checks.database = await this.prisma.$queryRaw`SELECT 1`
      .then(() => 'ok' as const)
      .catch(() => 'fail' as const);
    checks.redis = await this.redis
      .ping()
      .then(() => 'ok' as const)
      .catch(() => 'fail' as const);
    checks.storage = (await this.storage.ping()) ? 'ok' : 'fail';
    const rz = !!this.env.RAZORPAY_KEY_ID;
    return {
      status: Object.values(checks).every((c) => c !== 'fail') ? 'ok' : 'degraded',
      version: this.env.APP_VERSION,
      demoMode: this.env.LOCAL_DEMO_MODE,
      checks,
      integrations: {
        payments: rz ? 'configured' : this.env.LOCAL_DEMO_MODE ? 'demo' : 'not_configured',
        otp: this.env.OTP_PROVIDER === 'emulator' ? 'demo' : 'configured',
        push: this.push.enabled ? 'configured' : 'not_configured',
        maps: 'not_configured',
      },
    };
  }
}
