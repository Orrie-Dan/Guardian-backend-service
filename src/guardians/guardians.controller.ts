import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import { AuthUserPayload } from '../auth/interfaces/auth-user.interface';
import { HeartbeatDto } from './dto/heartbeat.dto';
import { LocationHistoryQueryDto } from './dto/location-history-query.dto';
import { UpdateGuardianDto } from './dto/update-guardian.dto';
import { ListGuardianJobsQueryDto } from '../jobs/dto/list-guardian-jobs-query.dto';
import { GuardianPayrollService } from '../guardian-payroll/guardian-payroll.service';
import { ListEarningsQueryDto } from '../guardian-payroll/dto/list-earnings-query.dto';
import { PaginationQueryDto } from '../common/dto/pagination-query.dto';
import { GuardianReviewsService } from '../guardian-reviews/guardian-reviews.service';
import { GuardiansService } from './guardians.service';

@ApiTags('guardians')
@ApiBearerAuth()
@Controller('guardians')
export class GuardiansController {
  constructor(
    private readonly guardians: GuardiansService,
    private readonly payroll: GuardianPayrollService,
    private readonly guardianReviews: GuardianReviewsService,
  ) {}

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

  @Get('me/location')
  @RequirePermissions('guardians:read_self')
  @ApiOperation({ summary: 'Latest guardian location (live presence or last history point)' })
  myLocation(@CurrentUser() user: AuthUserPayload) {
    return this.guardians.getMyLocation(user);
  }

  @Get('me/location/history')
  @RequirePermissions('guardians:read_self')
  @ApiOperation({ summary: 'Paginated location history for the signed-in guardian' })
  myLocationHistory(
    @CurrentUser() user: AuthUserPayload,
    @Query() query: LocationHistoryQueryDto,
  ) {
    return this.guardians.getMyLocationHistory(user, query);
  }

  @Get('me/jobs')
  @RequirePermissions('jobs:read')
  @ApiOperation({
    summary:
      'Paginated job history for the signed-in guardian (all statuses, full job detail)',
  })
  myJobs(
    @CurrentUser() user: AuthUserPayload,
    @Query() query: ListGuardianJobsQueryDto,
  ) {
    return this.guardians.listMyJobs(user, query);
  }

  @Get('me/earnings/ledger')
  @RequirePermissions('guardians:read_earnings')
  @ApiOperation({ summary: 'Paginated earnings ledger for the signed-in guardian' })
  myEarningsLedger(
    @CurrentUser() user: AuthUserPayload,
    @Query() query: ListEarningsQueryDto,
  ) {
    return this.payroll.getLedger(user.guardianId!, query);
  }

  @Get('me/earnings')
  @RequirePermissions('guardians:read_earnings')
  @ApiOperation({ summary: 'Earnings summary (pending vs paid) for the signed-in guardian' })
  myEarningsSummary(
    @CurrentUser() user: AuthUserPayload,
    @Query() query: ListEarningsQueryDto,
  ) {
    return this.payroll.getSummary(user.guardianId!, query);
  }

  @Get('me/payouts')
  @RequirePermissions('guardians:read_earnings')
  @ApiOperation({ summary: 'Payout history for the signed-in guardian' })
  myPayouts(
    @CurrentUser() user: AuthUserPayload,
    @Query() query: PaginationQueryDto,
  ) {
    return this.payroll.listPayouts(user.guardianId!, query);
  }

  @Get('me/reviews')
  @RequirePermissions('guardians:read_self')
  @ApiOperation({ summary: 'Paginated reviews received by the signed-in guardian' })
  myReviews(
    @CurrentUser() user: AuthUserPayload,
    @Query() query: PaginationQueryDto,
  ) {
    return this.guardianReviews.listForGuardian(user.guardianId!, query, user);
  }

  @Get('me/certifications')
  @RequirePermissions('guardians:read_certifications')
  certifications(@CurrentUser() user: AuthUserPayload) {
    return this.guardians.listCertifications(user);
  }

  @Get('me/certifications/:certificationId')
  @RequirePermissions('guardians:read_certifications')
  certification(
    @CurrentUser() user: AuthUserPayload,
    @Param('certificationId', ParseUUIDPipe) certificationId: string,
  ) {
    return this.guardians.getMyCertification(user, certificationId);
  }

  @Post('me/certifications')
  @RequirePermissions('guardians:read_certifications')
  @ApiOperation({
    summary: 'Disabled — certifications are managed by administrators',
  })
  addCertification() {
    return this.guardians.addCertification();
  }

  @Get(':id/location/history')
  @RequirePermissions('guardians:read')
  @ApiOperation({ summary: 'Paginated location history for a guardian' })
  locationHistory(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: LocationHistoryQueryDto,
  ) {
    return this.guardians.getLocationHistory(id, query);
  }

  @Get(':id/reviews')
  @RequirePermissions('guardians:read')
  @ApiOperation({ summary: 'Paginated reviews received by a guardian (ops)' })
  listGuardianReviews(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: PaginationQueryDto,
    @CurrentUser() user: AuthUserPayload,
  ) {
    return this.guardianReviews.listForGuardian(id, query, user);
  }

  @Get(':id/location')
  @RequirePermissions('guardians:read')
  @ApiOperation({ summary: 'Latest location for a guardian' })
  location(@Param('id', ParseUUIDPipe) id: string) {
    return this.guardians.getLocationById(id);
  }

  @Get(':id')
  @RequirePermissions('guardians:read')
  getOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.guardians.getById(id);
  }
}

