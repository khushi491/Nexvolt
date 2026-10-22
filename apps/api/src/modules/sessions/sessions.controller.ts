import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiTags } from '@nestjs/swagger';
import { CreateEvidenceUploadSchema } from '@nexvolt/shared';
import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import type { AuthUser } from '../../common/auth/auth-user';
import { CurrentUser, ReqMeta, type RequestMeta } from '../../common/auth/decorators';
import { SessionsService } from './sessions.service';

const ConfirmSchema = z.object({
  readingKwh: z.string().trim().regex(/^\d{1,9}(\.\d{1,3})?$/, 'Enter the meter reading in kWh, up to 3 decimals').optional(),
  evidenceId: z.string().uuid().optional(),
  note: z.string().trim().max(300).optional(),
});
class ConfirmDto extends createZodDto(ConfirmSchema) {}
class EvidenceUploadDto extends createZodDto(CreateEvidenceUploadSchema) {}

@ApiTags('charging-sessions')
@ApiBearerAuth()
@Controller('charging-sessions')
export class SessionsController {
  constructor(private readonly sessions: SessionsService) {}

  @Get(':bookingId')
  get(@CurrentUser() user: AuthUser, @Param('bookingId', ParseUUIDPipe) bookingId: string) {
    return this.sessions.get(user, bookingId);
  }

  @Post(':bookingId/start')
  @HttpCode(200)
  start(@CurrentUser() user: AuthUser, @Param('bookingId', ParseUUIDPipe) bookingId: string, @Body() body: ConfirmDto) {
    return this.sessions.confirmStart(user, bookingId, body);
  }

  @Post(':bookingId/end')
  @HttpCode(200)
  end(@CurrentUser() user: AuthUser, @Param('bookingId', ParseUUIDPipe) bookingId: string, @Body() body: ConfirmDto) {
    return this.sessions.confirmEnd(user, bookingId, body);
  }

  @Post(':bookingId/complete')
  @HttpCode(200)
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  complete(@CurrentUser() user: AuthUser, @Param('bookingId', ParseUUIDPipe) bookingId: string, @ReqMeta() meta: RequestMeta) {
    return this.sessions.complete(user, bookingId, meta.idempotencyKey ?? null);
  }

  @Post(':bookingId/evidence')
  evidence(@CurrentUser() user: AuthUser, @Param('bookingId', ParseUUIDPipe) bookingId: string, @Body() body: EvidenceUploadDto) {
    return this.sessions.createEvidenceUpload(user, bookingId, body);
  }

  @Post(':bookingId/evidence/:evidenceId/complete')
  @HttpCode(200)
  evidenceComplete(@CurrentUser() user: AuthUser, @Param('bookingId', ParseUUIDPipe) bookingId: string, @Param('evidenceId', ParseUUIDPipe) evidenceId: string) {
    return this.sessions.completeEvidenceUpload(user, bookingId, evidenceId);
  }

  @Get(':bookingId/evidence/:evidenceId/url')
  evidenceUrl(@CurrentUser() user: AuthUser, @Param('bookingId', ParseUUIDPipe) bookingId: string, @Param('evidenceId', ParseUUIDPipe) evidenceId: string) {
    return this.sessions.evidenceUrl(user, bookingId, evidenceId);
  }
}
