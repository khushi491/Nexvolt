import { Body, Controller, Delete, Get, HttpCode, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RegisterDeviceSchema, UpdateMeSchema } from '@nexvolt/shared';
import { createZodDto } from 'nestjs-zod';
import type { AuthUser } from '../../common/auth/auth-user';
import { CurrentUser } from '../../common/auth/decorators';
import { UsersService } from './users.service';

class UpdateMeDto extends createZodDto(UpdateMeSchema) {}
class RegisterDeviceDto extends createZodDto(RegisterDeviceSchema) {}

@ApiTags('users')
@ApiBearerAuth()
@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get('me')
  me(@CurrentUser() user: AuthUser) {
    return this.users.getMe(user.id);
  }

  @Patch('me')
  update(@CurrentUser() user: AuthUser, @Body() body: UpdateMeDto) {
    return this.users.updateMe(user.id, body);
  }

  @Post('me/devices')
  @HttpCode(204)
  async registerDevice(@CurrentUser() user: AuthUser, @Body() body: RegisterDeviceDto) {
    await this.users.registerDevice(user.id, body.token, body.platform);
  }

  @Delete('me/devices')
  @HttpCode(204)
  async unregisterDevice(@CurrentUser() user: AuthUser, @Body() body: RegisterDeviceDto) {
    await this.users.unregisterDevice(user.id, body.token);
  }

  @Post('me/deletion-request')
  @HttpCode(200)
  requestDeletion(@CurrentUser() user: AuthUser) {
    return this.users.requestDeletion(user.id);
  }
}
