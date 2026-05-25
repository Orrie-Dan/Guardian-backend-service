import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import { AuthUserPayload } from '../auth/interfaces/auth-user.interface';
import { AssignmentsService } from './assignments.service';
import { NoShowDto } from './dto/no-show.dto';

@ApiTags('assignments')
@ApiBearerAuth()
@Controller('assignments')
export class AssignmentsController {
  constructor(private readonly assignments: AssignmentsService) {}

  @Get('me')
  @RequirePermissions('assignments:read')
  @ApiOperation({ summary: 'Active offers and assignment for guardian' })
  me(@CurrentUser() user: AuthUserPayload) {
    return this.assignments.findForGuardian(user.guardianId!);
  }

  @Post(':id/accept')
  @RequirePermissions('assignments:accept')
  accept(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUserPayload,
  ) {
    return this.assignments.accept(id, user.guardianId!);
  }

  @Post(':id/decline')
  @RequirePermissions('assignments:decline')
  decline(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUserPayload,
  ) {
    return this.assignments.decline(id, user.guardianId!);
  }

  @Post(':id/en-route')
  @RequirePermissions('assignments:en_route')
  enRoute(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUserPayload,
  ) {
    return this.assignments.enRoute(id, user.guardianId!);
  }

  @Post(':id/on-site')
  @RequirePermissions('assignments:on_site')
  onSite(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUserPayload,
  ) {
    return this.assignments.onSite(id, user.guardianId!);
  }

  @Post(':id/complete')
  @RequirePermissions('assignments:complete')
  complete(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUserPayload,
  ) {
    return this.assignments.complete(id, user.guardianId!);
  }

  @Post(':id/no-show')
  @RequirePermissions('assignments:no_show')
  noShow(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: NoShowDto,
  ) {
    return this.assignments.noShow(id, dto.reason);
  }
}
