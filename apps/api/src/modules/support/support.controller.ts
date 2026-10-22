import { Body, Controller, Get, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { CreateDisputeSchema, CreateIncidentSchema, CreateTicketSchema, TicketMessageSchema } from '@nexvolt/shared';
import { createZodDto } from 'nestjs-zod';
import type { AuthUser } from '../../common/auth/auth-user';
import { CurrentUser } from '../../common/auth/decorators';
import { SupportService } from './support.service';

class CreateTicketDto extends createZodDto(CreateTicketSchema) {}
class TicketMessageDto extends createZodDto(TicketMessageSchema) {}
class CreateIncidentDto extends createZodDto(CreateIncidentSchema) {}
class CreateDisputeDto extends createZodDto(CreateDisputeSchema) {}

@ApiTags('support')
@ApiBearerAuth()
@Controller('support')
export class SupportController {
  constructor(private readonly support: SupportService) {}

  @Post('tickets')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  create(@CurrentUser() user: AuthUser, @Body() body: CreateTicketDto) {
    return this.support.createTicket(user, body);
  }

  @Get('tickets')
  mine(@CurrentUser() user: AuthUser) {
    return this.support.myTickets(user);
  }

  @Get('tickets/:id')
  get(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.support.getTicket(user, id);
  }

  @Post('tickets/:id/messages')
  message(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() body: TicketMessageDto) {
    return this.support.addMessage(user, id, body.body, body.internal);
  }
}

@ApiTags('incidents')
@ApiBearerAuth()
@Controller('incidents')
export class IncidentsController {
  constructor(private readonly support: SupportService) {}

  @Post()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  report(@CurrentUser() user: AuthUser, @Body() body: CreateIncidentDto) {
    return this.support.reportIncident(user, body);
  }

  @Get('mine')
  mine(@CurrentUser() user: AuthUser) {
    return this.support.myIncidents(user);
  }
}

@ApiTags('disputes')
@ApiBearerAuth()
@Controller('disputes')
export class DisputesController {
  constructor(private readonly support: SupportService) {}

  @Post()
  raise(@CurrentUser() user: AuthUser, @Body() body: CreateDisputeDto) {
    return this.support.raiseDispute(user, body);
  }

  @Get('mine')
  mine(@CurrentUser() user: AuthUser) {
    return this.support.myDisputes(user);
  }
}
