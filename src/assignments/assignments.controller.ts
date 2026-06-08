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
import { EarlyReleaseRejectDto, EarlyReleaseRequestDto } from './dto/early-release.dto';
import { NoShowDto } from './dto/no-show.dto';
import { ReplacementRequestDto } from './dto/replacement.dto';

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

  @Post(':id/replacement-request')
  @RequirePermissions('assignments:replacement_request')
  requestReplacement(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReplacementRequestDto,
    @CurrentUser() user: AuthUserPayload,
  ) {
    return this.assignments.requestReplacement(id, user.guardianId!, dto.reason);
  }

  @Post(':id/early-release')
  @RequirePermissions('assignments:early_release')
  requestEarlyRelease(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: EarlyReleaseRequestDto,
    @CurrentUser() user: AuthUserPayload,
  ) {
    return this.assignments.requestEarlyRelease(id, user.guardianId!, dto.reason);
  }

  @Post(':id/early-release/approve')
  @RequirePermissions('assignments:early_release_approve')
  approveEarlyRelease(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUserPayload,
  ) {
    return this.assignments.approveEarlyRelease(id, user);
  }

  @Post(':id/early-release/reject')
  @RequirePermissions('assignments:early_release_reject')
  rejectEarlyRelease(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: EarlyReleaseRejectDto,
    @CurrentUser() user: AuthUserPayload,
  ) {
    return this.assignments.rejectEarlyRelease(id, user, dto.note);
  }

  @Post(':id/complete')
  @RequirePermissions('assignments:complete')
  complete(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUserPayload,
  ) {
    return this.assignments.complete(id, user.guardianId!, user.sub);
  }

  @Post(':id/no-show')
  @RequirePermissions('assignments:no_show')
  noShow(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: NoShowDto,
    @CurrentUser() user: AuthUserPayload,
  ) {
    return this.assignments.noShow(id, {
      reasonCode: dto.reasonCode,
      reasonNote: dto.reasonNote ?? dto.reason,
      actorUserId: user.sub,
      actorRole: user.activeRole,
    });
  }
}

