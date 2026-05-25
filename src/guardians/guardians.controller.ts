import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import { AuthUserPayload } from '../auth/interfaces/auth-user.interface';
import { HeartbeatDto } from './dto/heartbeat.dto';
import { UpdateGuardianDto } from './dto/update-guardian.dto';
import { GuardiansService } from './guardians.service';

@ApiTags('guardians')
@ApiBearerAuth()
@Controller('guardians')
export class GuardiansController {
  constructor(private readonly guardians: GuardiansService) {}

  @Get('me')
  @RequirePermissions('guardians:read_self')
  me(@CurrentUser() user: AuthUserPayload) {
    return this.guardians.getMe(user);
  }

  @Patch('me')
  @RequirePermissions('guardians:update_self')
  updateMe(
    @CurrentUser() user: AuthUserPayload,
    @Body() dto: UpdateGuardianDto,
  ) {
    return this.guardians.updateMe(user, dto);
  }

  @Post('me/shift/start')
  @RequirePermissions('guardians:shift')
  startShift(@CurrentUser() user: AuthUserPayload) {
    return this.guardians.startShift(user);
  }

  @Post('me/shift/end')
  @RequirePermissions('guardians:shift')
  endShift(@CurrentUser() user: AuthUserPayload) {
    return this.guardians.endShift(user);
  }

  @Post('me/heartbeat')
  @RequirePermissions('guardians:heartbeat')
  heartbeat(
    @CurrentUser() user: AuthUserPayload,
    @Body() dto: HeartbeatDto,
  ) {
    return this.guardians.heartbeat(user, dto);
  }

  @Get('me/certifications')
  @RequirePermissions('guardians:read_certifications')
  certifications(@CurrentUser() user: AuthUserPayload) {
    return this.guardians.listCertifications(user);
  }

  @Post('me/certifications')
  @RequirePermissions('guardians:read_certifications')
  @ApiOperation({
    summary: 'Disabled — certifications are managed by administrators',
  })
  addCertification() {
    return this.guardians.addCertification();
  }

  @Get(':id')
  @RequirePermissions('guardians:read')
  getOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.guardians.getById(id);
  }
}
