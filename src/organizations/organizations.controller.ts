import {

  Body,

  Controller,

  Delete,

  Get,

  Param,

  ParseUUIDPipe,

  Patch,

  Post,

} from '@nestjs/common';

import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import { CurrentUser } from '../auth/decorators/current-user.decorator';

import { OrgScope } from '../auth/decorators/org-scope.decorator';

import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';

import { AuthUserPayload } from '../auth/interfaces/auth-user.interface';

import { BillingService } from '../billing/billing.service';

import { CompleteSiteDto } from './dto/complete-site.dto';
import { CreateLocationDto } from './dto/create-location.dto';

import { CreateOrganizationDto } from './dto/create-organization.dto';

import { InviteMemberDto } from './dto/invite-member.dto';

import { UpdateLocationDto } from './dto/update-location.dto';

import { UpdateOrganizationDto } from './dto/update-organization.dto';

import { OrganizationsService } from './organizations.service';



@ApiTags('organizations')

@ApiBearerAuth()

@Controller('organizations')

export class OrganizationsController {

  constructor(

    private readonly organizations: OrganizationsService,

    private readonly billing: BillingService,

  ) {}



  @Post()

  @RequirePermissions('organizations:create')

  create(@Body() dto: CreateOrganizationDto, @CurrentUser() user: AuthUserPayload) {

    return this.organizations.createOrganization(dto, user);

  }



  @Get()

  @RequirePermissions('organizations:read')

  list(@CurrentUser() user: AuthUserPayload) {

    return this.organizations.listForUser(user);

  }



  @Get(':id')

  @OrgScope('id')

  @RequirePermissions('organizations:read')

  getOne(

    @Param('id', ParseUUIDPipe) id: string,

    @CurrentUser() user: AuthUserPayload,

  ) {

    return this.organizations.getOrganization(id, user);

  }



  @Patch(':id')

  @OrgScope('id')

  @RequirePermissions('organizations:update')

  update(

    @Param('id', ParseUUIDPipe) id: string,

    @Body() dto: UpdateOrganizationDto,

    @CurrentUser() user: AuthUserPayload,

  ) {

    return this.organizations.updateOrganization(id, dto, user);

  }



  @Get(':id/locations')

  @OrgScope('id')

  @RequirePermissions('organizations:read_locations')

  listLocations(

    @Param('id', ParseUUIDPipe) id: string,

    @CurrentUser() user: AuthUserPayload,

  ) {

    return this.organizations.listLocations(id, user);

  }



  @Post(':id/locations/primary/complete-site')

  @OrgScope('id')

  @RequirePermissions('organizations:manage_locations')

  completePrimarySite(

    @Param('id', ParseUUIDPipe) id: string,

    @Body() dto: CompleteSiteDto,

    @CurrentUser() user: AuthUserPayload,

  ) {

    return this.organizations.completePrimarySite(id, dto, user);

  }



  @Post(':id/locations')

  @OrgScope('id')

  @RequirePermissions('organizations:manage_locations')

  addLocation(

    @Param('id', ParseUUIDPipe) id: string,

    @Body() dto: CreateLocationDto,

    @CurrentUser() user: AuthUserPayload,

  ) {

    return this.organizations.addLocation(id, dto, user);

  }



  @Patch(':id/locations/:locationId')

  @OrgScope('id')

  @RequirePermissions('organizations:manage_locations')

  updateLocation(

    @Param('id', ParseUUIDPipe) id: string,

    @Param('locationId', ParseUUIDPipe) locationId: string,

    @Body() dto: UpdateLocationDto,

    @CurrentUser() user: AuthUserPayload,

  ) {

    return this.organizations.updateLocation(id, locationId, dto, user);

  }



  @Get(':id/members')

  @OrgScope('id')

  @RequirePermissions('organizations:read_members')

  listMembers(

    @Param('id', ParseUUIDPipe) id: string,

    @CurrentUser() user: AuthUserPayload,

  ) {

    return this.organizations.listMembers(id, user);

  }



  @Post(':id/members/invite')

  @OrgScope('id')

  @RequirePermissions('organizations:invite_member')

  invite(

    @Param('id', ParseUUIDPipe) id: string,

    @Body() dto: InviteMemberDto,

    @CurrentUser() user: AuthUserPayload,

  ) {

    return this.organizations.inviteMember(id, dto, user);

  }



  @Delete(':id/members/:userId')

  @OrgScope('id')

  @RequirePermissions('organizations:remove_member')

  removeMember(

    @Param('id', ParseUUIDPipe) id: string,

    @Param('userId', ParseUUIDPipe) userId: string,

    @CurrentUser() user: AuthUserPayload,

  ) {

    return this.organizations.removeMember(id, userId, user);

  }



  @Get(':id/invoices')

  @OrgScope('id')

  @RequirePermissions('organizations:read_invoices')

  invoices(@Param('id', ParseUUIDPipe) id: string) {

    return this.billing.listForOrganization(id);

  }

}


