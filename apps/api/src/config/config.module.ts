import { Global, Module } from '@nestjs/common';
import { env, ENV } from './env';

@Global()
@Module({
  providers: [{ provide: ENV, useFactory: () => env() }],
  exports: [ENV],
})
export class ConfigModule {}
