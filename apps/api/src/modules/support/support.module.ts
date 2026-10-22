import { Module } from '@nestjs/common';
import { DisputesController, IncidentsController, SupportController } from './support.controller';
import { SupportService } from './support.service';

@Module({
  controllers: [SupportController, IncidentsController, DisputesController],
  providers: [SupportService],
  exports: [SupportService],
})
export class SupportModule {}
