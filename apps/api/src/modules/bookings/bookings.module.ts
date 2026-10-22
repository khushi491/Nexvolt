import { Global, Module } from '@nestjs/common';
import { BookingMapper } from './booking.mapper';
import { BookingsController } from './bookings.controller';
import { BookingsService } from './bookings.service';

@Global()
@Module({
  controllers: [BookingsController],
  providers: [BookingsService, BookingMapper],
  exports: [BookingsService, BookingMapper],
})
export class BookingsModule {}
