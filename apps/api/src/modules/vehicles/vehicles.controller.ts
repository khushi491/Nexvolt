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
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CreateVehicleSchema, UpdateVehicleSchema } from '@nexvolt/shared';
import { createZodDto } from 'nestjs-zod';
import type { AuthUser } from '../../common/auth/auth-user';
import { CurrentUser, Public } from '../../common/auth/decorators';
import { VehiclesService } from './vehicles.service';

class CreateVehicleDto extends createZodDto(CreateVehicleSchema) {}
class UpdateVehicleDto extends createZodDto(UpdateVehicleSchema) {}

@ApiTags('vehicles')
@ApiBearerAuth()
@Controller('vehicles')
export class VehiclesController {
  constructor(private readonly vehicles: VehiclesService) {}

  @Public()
  @Get('catalog')
  catalog(@Query('q') q?: string) {
    return this.vehicles.catalog(q?.slice(0, 60));
  }

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.vehicles.list(user.id);
  }

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() body: CreateVehicleDto) {
    return this.vehicles.create(user.id, body);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: UpdateVehicleDto,
  ) {
    return this.vehicles.update(user.id, id, body);
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    await this.vehicles.remove(user.id, id);
  }
}
