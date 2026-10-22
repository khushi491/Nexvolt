import { Body, Controller, Get, HttpCode, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { HostOnboardSchema, UpdateHostSchema } from '@nexvolt/shared';
import { createZodDto } from 'nestjs-zod';
import type { AuthUser } from '../../common/auth/auth-user';
import { CurrentUser, Roles } from '../../common/auth/decorators';
import { HostsService } from './hosts.service';

class HostOnboardDto extends createZodDto(HostOnboardSchema) {}
class UpdateHostDto extends createZodDto(UpdateHostSchema) {}

@ApiTags('hosts')
@ApiBearerAuth()
@Controller('hosts')
export class HostsController {
  constructor(private readonly hosts: HostsService) {}

  @Post('onboard')
  onboard(@CurrentUser() user: AuthUser, @Body() body: HostOnboardDto) {
    return this.hosts.onboard(user, body);
  }

  @Roles('HOST')
  @Get('me')
  me(@CurrentUser() user: AuthUser) {
    return this.hosts.me(user);
  }

  @Roles('HOST')
  @Patch('me')
  update(@CurrentUser() user: AuthUser, @Body() body: UpdateHostDto) {
    return this.hosts.update(user, body);
  }

  @Roles('HOST')
  @Post('me/kyc/submit')
  @HttpCode(200)
  submitKyc(@CurrentUser() user: AuthUser) {
    return this.hosts.submitKyc(user);
  }

  @Roles('HOST')
  @Post('me/payout-onboarding')
  @HttpCode(200)
  payoutOnboarding(@CurrentUser() user: AuthUser) {
    return this.hosts.requestPayoutOnboarding(user);
  }
}
