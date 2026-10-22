import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { BookingListQuerySchema, CancelBookingSchema, CreateBookingSchema, DeclineBookingSchema, QuoteBookingSchema } from '@nexvolt/shared';
import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import type { AuthUser } from '../../common/auth/auth-user';
import { CurrentUser, ReqMeta, Roles, type RequestMeta } from '../../common/auth/decorators';
import { BookingsService } from './bookings.service';

class QuoteBookingDto extends createZodDto(QuoteBookingSchema) {}
class CreateBookingDto extends createZodDto(CreateBookingSchema) {}
class CancelBookingDto extends createZodDto(CancelBookingSchema) {}
class DeclineBookingDto extends createZodDto(DeclineBookingSchema) {}
class BookingListQueryDto extends createZodDto(BookingListQuerySchema) {}
class HostBookingQueryDto extends createZodDto(BookingListQuerySchema.extend({ status: z.string().max(40).optional() })) {}

@ApiTags('bookings')
@ApiBearerAuth()
@Controller('bookings')
export class BookingsController {
  constructor(private readonly bookings: BookingsService) {}

  @Post('quote')
  @HttpCode(200)
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  quote(@CurrentUser() user: AuthUser, @Body() body: QuoteBookingDto) {
    return this.bookings.quote(user, body);
  }

  @Post()
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  create(@CurrentUser() user: AuthUser, @Body() body: CreateBookingDto, @ReqMeta() meta: RequestMeta) {
    return this.bookings.create(user, body, meta.idempotencyKey);
  }

  @Get()
  list(@CurrentUser() user: AuthUser, @Query() q: BookingListQueryDto) {
    return this.bookings.listForDriver(user, q.scope, q.limit);
  }

  @Roles('HOST')
  @Get('host')
  hostQueue(@CurrentUser() user: AuthUser, @Query() q: HostBookingQueryDto) {
    return this.bookings.listForHost(user, q.scope, q.limit, q.status);
  }

  @Get(':id')
  get(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.bookings.get(user, id);
  }

  @Get(':id/access')
  access(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @ReqMeta() meta: RequestMeta) {
    return this.bookings.access(user, id, meta);
  }

  @Get(':id/events')
  events(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.bookings.events(user, id);
  }

  @Get(':id/receipt')
  receipt(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.bookings.receipt(user, id);
  }

  @Get(':id/cancellation-preview')
  preview(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.bookings.cancellationPreview(user, id);
  }

  @Post(':id/cancel')
  @HttpCode(200)
  cancel(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() body: CancelBookingDto, @ReqMeta() meta: RequestMeta) {
    return this.bookings.cancel(user, id, body.reason, meta);
  }

  @Roles('HOST')
  @Post(':id/approve')
  @HttpCode(200)
  approve(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.bookings.approve(user, id);
  }

  @Roles('HOST')
  @Post(':id/decline')
  @HttpCode(200)
  decline(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() body: DeclineBookingDto) {
    return this.bookings.decline(user, id, body.reason);
  }

  @Post(':id/check-in')
  @HttpCode(200)
  checkIn(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.bookings.checkIn(user, id);
  }

  @Roles('HOST')
  @Post(':id/no-show')
  @HttpCode(200)
  noShow(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.bookings.markNoShow(user, id);
  }
}
