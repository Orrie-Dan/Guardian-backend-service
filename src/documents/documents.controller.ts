import { Body, Controller, Get, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import { AuthUserPayload } from '../auth/interfaces/auth-user.interface';
import { PresignDocumentDto } from './dto/presign-document.dto';
import { DocumentsService } from './documents.service';

@ApiTags('documents')
@ApiBearerAuth()
@Controller('documents')
export class DocumentsController {
  constructor(private readonly documents: DocumentsService) {}

  @Post('presign')
  @RequirePermissions('documents:write')
  presign(
    @CurrentUser() user: AuthUserPayload,
    @Body() dto: PresignDocumentDto,
  ) {
    return this.documents.presign(user, dto);
  }

  @Post(':id/confirm')
  @RequirePermissions('documents:write')
  confirm(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUserPayload,
  ) {
    return this.documents.confirm(id, user);
  }

  @Get(':id')
  @RequirePermissions('documents:read')
  getOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUserPayload,
  ) {
    return this.documents.get(id, user);
  }
}
