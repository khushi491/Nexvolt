import { Global, Module } from '@nestjs/common';
import { ENV, type Env } from '../../config/env';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { FcmPushProvider, PUSH_PROVIDER } from './push.provider';

@Global()
@Module({
  controllers: [NotificationsController],
  providers: [
    NotificationsService,
    { provide: PUSH_PROVIDER, inject: [ENV], useFactory: (env: Env) => new FcmPushProvider(env) },
  ],
  exports: [NotificationsService, PUSH_PROVIDER],
})
export class NotificationsModule {}
