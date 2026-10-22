import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, APP_PIPE } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { LoggerModule } from 'nestjs-pino';
import { ZodValidationPipe } from 'nestjs-zod';
import { randomUUID } from 'node:crypto';
import { AuditModule } from './common/audit/audit.module';
import { JwtAuthGuard } from './common/auth/jwt-auth.guard';
import { CryptoModule } from './common/crypto/crypto.module';
import { AllExceptionsFilter } from './common/errors/all-exceptions.filter';
import { IdempotencyModule } from './common/idempotency/idempotency.module';
import { PrismaModule } from './common/prisma/prisma.module';
import { RedisModule } from './common/redis/redis.module';
import { ConfigModule } from './config/config.module';
import { env } from './config/env';
import { AuthModule, jwtModule } from './modules/auth/auth.module';
import { FavoritesModule } from './modules/favorites/favorites.module';
import { ReviewsModule } from './modules/reviews/reviews.module';
import { SupportModule } from './modules/support/support.module';
import { JobsModule } from './modules/jobs/jobs.module';
import { AdminModule } from './modules/admin/admin.module';
import { SessionsModule } from './modules/sessions/sessions.module';
import { PaymentsModule } from './modules/payments/payments.module';
import { BookingsModule } from './modules/bookings/bookings.module';
import { BookingCoreModule } from './modules/booking-core/booking-core.module';
import { ChargersModule } from './modules/chargers/chargers.module';
import { DocumentsModule } from './modules/documents/documents.module';
import { HealthController } from './modules/health/health.controller';
import { HostsModule } from './modules/hosts/hosts.module';
import { LedgerModule } from './modules/ledger/ledger.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { SettingsModule } from './modules/settings/settings.module';
import { StorageModule } from './modules/storage/storage.module';
import { UsersModule } from './modules/users/users.module';
import { VehiclesModule } from './modules/vehicles/vehicles.module';

@Module({
  imports: [
    ConfigModule,
    LoggerModule.forRoot({
      pinoHttp: {
        level: env().LOG_LEVEL,
        genReqId: (req) => (req.headers['x-request-id'] as string) || randomUUID(),
        transport:
          env().NODE_ENV === 'development'
            ? { target: 'pino-pretty', options: { singleLine: true } }
            : undefined,
        // Never log credentials, OTPs, tokens or payment signatures.
        redact: [
          'req.headers.authorization',
          'req.headers.cookie',
          'req.headers["x-razorpay-signature"]',
          'req.headers["idempotency-key"]',
        ],
        autoLogging: { ignore: (req) => req.url?.startsWith('/api/v1/health') ?? false },
      },
    }),
    ThrottlerModule.forRoot({
      throttlers: [{ name: 'default', ttl: 60_000, limit: 120 }],
      // Automated tests send many requests from one IP; DB-level OTP limits still apply.
      // Env validation forbids DISABLE_ROUTE_THROTTLING_FOR_TESTS in production.
      skipIf: () =>
        (env().NODE_ENV === 'test' && process.env.THROTTLE_IN_TESTS !== 'true') ||
        env().DISABLE_ROUTE_THROTTLING_FOR_TESTS,
    }),
    jwtModule,
    PrismaModule,
    RedisModule,
    CryptoModule,
    AuditModule,
    IdempotencyModule,
    SettingsModule,
    StorageModule,
    NotificationsModule,
    BookingCoreModule,
    LedgerModule,
    UsersModule,
    AuthModule,
    VehiclesModule,
    HostsModule,
    DocumentsModule,
    ChargersModule,
    BookingsModule,
    PaymentsModule,
    SessionsModule,
    ReviewsModule,
    FavoritesModule,
    SupportModule,
    AdminModule,
    JobsModule,
  ],
  controllers: [HealthController],
  providers: [
    { provide: APP_PIPE, useClass: ZodValidationPipe },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
  ],
})
export class AppModule {}
