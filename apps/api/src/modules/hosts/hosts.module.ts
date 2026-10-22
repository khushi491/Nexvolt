import { Global, Module } from '@nestjs/common';
import { HostsController } from './hosts.controller';
import { HostsService } from './hosts.service';

@Global()
@Module({ controllers: [HostsController], providers: [HostsService], exports: [HostsService] })
export class HostsModule {}
