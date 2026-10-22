import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { AuthUser } from '../../common/auth/auth-user';
import { CurrentUser, Roles } from '../../common/auth/decorators';
import { HostsService } from '../hosts/hosts.service';
import { LedgerService } from './ledger.service';

@ApiTags('hosts')
@ApiBearerAuth()
@Roles('HOST')
@Controller('hosts/me')
export class HostEarningsController {
  constructor(
    private readonly ledger: LedgerService,
    private readonly hosts: HostsService,
  ) {}

  @Get('earnings')
  async earnings(@CurrentUser() user: AuthUser) {
    const h = await this.hosts.requireHost(user);
    return this.ledger.summary(h.id);
  }

  @Get('ledger')
  async entries(@CurrentUser() user: AuthUser, @Query('limit') limit?: string) {
    const h = await this.hosts.requireHost(user);
    return this.ledger.entries(h.id, Number(limit) || 100);
  }

  @Get('payouts')
  async payouts(@CurrentUser() user: AuthUser) {
    const h = await this.hosts.requireHost(user);
    return this.ledger.payouts({ hostId: h.id });
  }
}
