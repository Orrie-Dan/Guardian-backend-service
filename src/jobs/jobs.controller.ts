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
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ClientInvoiceDetailDto } from '../billing/dto/invoice-detail.dto';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import { AuthUserPayload } from '../auth/interfaces/auth-user.interface';
import { CreateIncidentDto } from './dto/create-incident.dto';
import { CreateJobDto } from './dto/create-job.dto';
import { ListJobsQueryDto } from './dto/list-jobs-query.dto';
import { JobsService } from './jobs.service';

@ApiTags('jobs')
@ApiBearerAuth()
@Controller('jobs')
export class JobsController {
  constructor(private readonly jobs: JobsService) {}

  @Post()
  @RequirePermissions('jobs:create')
  create(@Body() dto: CreateJobDto, @CurrentUser() user: AuthUserPayload) {
    return this.jobs.create(dto, user);
  }

  @Get()
  @RequirePermissions('jobs:read')
  list(@Query() query: ListJobsQueryDto, @CurrentUser() user: AuthUserPayload) {
    return this.jobs.list(query, user);
  }

  @Get(':id/timeline')
  @RequirePermissions('jobs:read')
  timeline(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUserPayload,
  ) {
    return this.jobs.timeline(id, user);
  }

  @Get(':id/tracking')
  @RequirePermissions('jobs:read')
  @ApiOperation({
    summary:
      'Live guardian position and ETA for an accepted job (client/org members with jobs:read)',
  })
  tracking(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUserPayload,
  ) {
    return this.jobs.getTracking(id, user);
  }

  @Get(':id/invoice')
  @ApiOkResponse({ type: ClientInvoiceDetailDto })
  @RequirePermissions('jobs:read_invoice')
  invoice(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUserPayload,
  ) {
    return this.jobs.getInvoice(id, user);
  }

  @Get(':id/incidents')
  @RequirePermissions('jobs:read')
  incidents(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUserPayload,
  ) {
    return this.jobs.listIncidents(id, user);
  }

  @Post(':id/incidents')
  @RequirePermissions('jobs:create_incident')
  createIncident(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateIncidentDto,
    @CurrentUser() user: AuthUserPayload,
  ) {
    return this.jobs.createIncident(id, dto, user);
  }

  @Patch(':id/cancel')
  @RequirePermissions('jobs:cancel')
  cancel(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUserPayload,
    @Body() body: { reason?: string },
  ) {
    return this.jobs.cancel(id, user, body?.reason);
  }

  @Post(':id/dispatch')
  @RequirePermissions('jobs:dispatch')
  dispatch(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUserPayload,
  ) {
    return this.jobs.dispatch(id, user);
  }

  @Post(':id/complete')
  @RequirePermissions('jobs:complete')
  complete(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUserPayload,
  ) {
    return this.jobs.complete(id, user.sub);
  }

  @Get(':id')
  @RequirePermissions('jobs:read')
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUserPayload,
  ) {
    return this.jobs.findOne(id, user);
  }
}

