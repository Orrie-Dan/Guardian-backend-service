import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import { AuthUserPayload } from '../auth/interfaces/auth-user.interface';
import { PaginationQueryDto } from '../common/dto/pagination-query.dto';
import { NotificationsService } from './notifications.service';

@ApiTags('notifications')
@ApiBearerAuth()
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  @RequirePermissions('notifications:read')
  list(
    @CurrentUser() user: AuthUserPayload,
    @Query() query: PaginationQueryDto,
  ) {
    return this.notifications.list(user, query);
  }

  @Patch(':id/read')
  @RequirePermissions('notifications:write')
  markRead(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUserPayload,
  ) {
    return this.notifications.markRead(user, id);
  }

  @Post('read-all')
  @RequirePermissions('notifications:write')
  readAll(@CurrentUser() user: AuthUserPayload) {
    return this.notifications.markAllRead(user);
  }
}
