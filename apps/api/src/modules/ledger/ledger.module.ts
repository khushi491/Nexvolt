import { Global, Module } from '@nestjs/common';
import { HostEarningsController } from './ledger.controller';
import { LedgerService } from './ledger.service';

@Global()
@Module({ controllers: [HostEarningsController], providers: [LedgerService], exports: [LedgerService] })
export class LedgerModule {}
