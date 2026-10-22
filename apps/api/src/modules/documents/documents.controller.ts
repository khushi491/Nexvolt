import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CreateDocumentUploadSchema } from '@nexvolt/shared';
import { createZodDto } from 'nestjs-zod';
import type { AuthUser } from '../../common/auth/auth-user';
import { CurrentUser, Roles } from '../../common/auth/decorators';
import { DocumentsService } from './documents.service';

class CreateDocumentUploadDto extends createZodDto(CreateDocumentUploadSchema) {}

@ApiTags('documents')
@ApiBearerAuth()
@Controller('documents')
export class DocumentsController {
  constructor(private readonly docs: DocumentsService) {}

  @Roles('HOST')
  @Post('uploads')
  createUpload(@CurrentUser() user: AuthUser, @Body() body: CreateDocumentUploadDto) {
    return this.docs.createUpload(user, body);
  }

  @Roles('HOST')
  @Post(':id/complete')
  @HttpCode(200)
  complete(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.docs.completeUpload(user, id);
  }

  @Roles('HOST')
  @Get()
  list(@CurrentUser() user: AuthUser, @Query('chargerId') chargerId?: string) {
    return this.docs.list(user, chargerId);
  }

  @Get(':id/url')
  url(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.docs.downloadUrl(user, id);
  }

  @Roles('HOST')
  @Delete(':id')
  @HttpCode(204)
  async remove(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    await this.docs.remove(user, id);
  }
}
