import { Global, Module } from '@nestjs/common';
import { AvailabilityService } from './availability.service';
import { ChargerMapper } from './charger.mapper';
import { ChargersController, SearchController } from './chargers.controller';
import { ChargersService } from './chargers.service';
import { PublicChargersService } from './public-chargers.service';

@Global()
@Module({
  controllers: [SearchController, ChargersController],
  providers: [ChargersService, PublicChargersService, AvailabilityService, ChargerMapper],
  exports: [ChargersService, PublicChargersService, AvailabilityService, ChargerMapper],
})
export class ChargersModule {}
