import { Global, Module } from '@nestjs/common';
import { BookingTransitionsService } from './booking-transitions.service';

@Global()
@Module({ providers: [BookingTransitionsService], exports: [BookingTransitionsService] })
export class BookingCoreModule {}
