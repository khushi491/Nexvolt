import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import {
  AvailabilityQuerySchema,
  AvailabilitySchema,
  CreateChargerSchema,
  CreateExceptionSchema,
  CreatePhotoUploadSchema,
  SearchChargersSchema,
  UpdateChargerSchema,
} from '@nexvolt/shared';
import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import type { AuthUser } from '../../common/auth/auth-user';
import { CurrentUser, MaybeUser, OptionalAuth, Public, Roles } from '../../common/auth/decorators';
import { AvailabilityService } from './availability.service';
import { ChargersService } from './chargers.service';
import { PublicChargersService } from './public-chargers.service';

class CreateChargerDto extends createZodDto(CreateChargerSchema) {}
class UpdateChargerDto extends createZodDto(UpdateChargerSchema) {}
class AvailabilityDto extends createZodDto(AvailabilitySchema) {}
class CreateExceptionDto extends createZodDto(CreateExceptionSchema) {}
class CreatePhotoUploadDto extends createZodDto(CreatePhotoUploadSchema) {}
class SearchChargersDto extends createZodDto(SearchChargersSchema) {}
class AvailabilityQueryDto extends createZodDto(AvailabilityQuerySchema) {}
class PauseDto extends createZodDto(z.object({ reason: z.string().trim().max(300).optional() })) {}

@ApiTags('search')
@Controller('search')
export class SearchController {
  constructor(private readonly chargers: PublicChargersService) {}

  @Public()
  @OptionalAuth()
  @Get('chargers')
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  search(@Query() query: SearchChargersDto, @MaybeUser() user?: AuthUser) {
    return this.chargers.search(query, user);
  }
}

@ApiTags('chargers')
@ApiBearerAuth()
@Controller('chargers')
export class ChargersController {
  constructor(
    private readonly chargers: ChargersService,
    private readonly publicChargers: PublicChargersService,
    private readonly availability: AvailabilityService,
  ) {}

  // ── Host management ──
  @Roles('HOST')
  @Get('mine')
  mine(@CurrentUser() user: AuthUser) {
    return this.chargers.listMine(user);
  }

  @Roles('HOST')
  @Post()
  create(@CurrentUser() user: AuthUser, @Body() body: CreateChargerDto) {
    return this.chargers.create(user, body);
  }

  @Roles('HOST')
  @Get(':id/manage')
  async manage(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    await this.chargers.getOwned(user, id);
    return this.chargers.manageView(id);
  }

  @Roles('HOST')
  @Patch(':id')
  update(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: UpdateChargerDto,
  ) {
    return this.chargers.update(user, id, body);
  }

  @Roles('HOST')
  @Post(':id/submit')
  @HttpCode(200)
  submit(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.chargers.submitForReview(user, id);
  }

  @Roles('HOST')
  @Post(':id/publish')
  @HttpCode(200)
  publish(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.chargers.setPublished(user, id, true);
  }

  @Roles('HOST')
  @Post(':id/unpublish')
  @HttpCode(200)
  unpublish(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.chargers.setPublished(user, id, false);
  }

  @Roles('HOST')
  @Post(':id/pause')
  @HttpCode(200)
  pause(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: PauseDto,
  ) {
    return this.chargers.setPaused(user, id, true, body.reason);
  }

  @Roles('HOST')
  @Post(':id/resume')
  @HttpCode(200)
  resume(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.chargers.setPaused(user, id, false);
  }

  @Roles('HOST')
  @Put(':id/availability')
  setAvailability(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: AvailabilityDto,
  ) {
    return this.chargers.setAvailability(user, id, body);
  }

  @Roles('HOST')
  @Post(':id/exceptions')
  addException(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: CreateExceptionDto,
  ) {
    return this.chargers.addException(user, id, body);
  }

  @Roles('HOST')
  @Delete(':id/exceptions/:exceptionId')
  removeException(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('exceptionId', ParseUUIDPipe) exceptionId: string,
  ) {
    return this.chargers.removeException(user, id, exceptionId);
  }

  @Roles('HOST')
  @Post(':id/photos')
  photoUpload(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: CreatePhotoUploadDto,
  ) {
    return this.chargers.createPhotoUpload(user, id, body);
  }

  @Roles('HOST')
  @Post(':id/photos/:photoId/complete')
  @HttpCode(200)
  photoComplete(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('photoId', ParseUUIDPipe) photoId: string,
  ) {
    return this.chargers.completePhotoUpload(user, id, photoId);
  }

  @Roles('HOST')
  @Delete(':id/photos/:photoId')
  photoDelete(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('photoId', ParseUUIDPipe) photoId: string,
  ) {
    return this.chargers.removePhoto(user, id, photoId);
  }

  // ── Public ──
  @Public()
  @OptionalAuth()
  @Get(':id')
  detail(
    @Param('id', ParseUUIDPipe) id: string,
    @MaybeUser() user?: AuthUser,
    @Query('vehicleId') vehicleId?: string,
  ) {
    return this.publicChargers.detail(id, user, vehicleId);
  }

  @Public()
  @Get(':id/availability')
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  slots(@Param('id', ParseUUIDPipe) id: string, @Query() q: AvailabilityQueryDto) {
    return this.availability.slotsForDate(id, q.date, q.durationMinutes);
  }

  @Public()
  @Get(':id/reviews')
  reviews(@Param('id', ParseUUIDPipe) id: string) {
    return this.publicChargers.reviews(id);
  }
}
