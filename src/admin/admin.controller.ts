import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Res,
  StreamableFile,
} from '@nestjs/common';
import { ApiBearerAuth, ApiProduces, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import {
  CertificationVerificationStatus,
  GuardianVerificationStatus,
  InvoiceStatus,
  VerificationStatus,
} from '@prisma/client';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import { AuthUserPayload } from '../auth/interfaces/auth-user.interface';
import { PaginationQueryDto } from '../common/dto/pagination-query.dto';
import { BillingService } from '../billing/billing.service';
import { AdminAnalyticsService } from './admin-analytics.service';
import { AdminAuditService } from './admin-audit.service';
import { AdminPricingService } from './admin-pricing.service';
import { AdminGuardiansService } from './admin-guardians.service';
import { AdminUsersService } from './admin-users.service';
import { BulkDeleteUsersDto } from './dto/bulk-delete-users.dto';
import { AdminVerificationService } from './admin-verification.service';
import { AdminCreateCertificationDto } from './dto/admin-create-certification.dto';
import { CreateGuardianDto } from './dto/create-guardian.dto';
import { CreateVettingDto } from './dto/create-vetting.dto';
import { ListGuardiansQueryDto } from './dto/list-guardians-query.dto';
import { ReviewVerificationDto } from './dto/review-verification.dto';
import { CreatePricingRuleDto } from './dto/create-pricing-rule.dto';
import { UpdatePricingRuleDto } from './dto/update-pricing-rule.dto';
import { UpdateGuardianDto } from './dto/update-guardian.dto';
import { PrismaService } from '../prisma/prisma.service';
import { DocumentsService } from '../documents/documents.service';

@ApiTags('admin')
@ApiBearerAuth()
@Controller('admin')
export class AdminController {
  constructor(
    private readonly guardians: AdminGuardiansService,
    private readonly users: AdminUsersService,
    private readonly verification: AdminVerificationService,
    private readonly documents: DocumentsService,
    private readonly pricing: AdminPricingService,
    private readonly audit: AdminAuditService,
    private readonly analytics: AdminAnalyticsService,
    private readonly billing: BillingService,
    private readonly prisma: PrismaService,
  ) {}

  @Get('users/:id/delete-preview')
  @RequirePermissions('admin:users:delete')
  previewUserDelete(@Param('id', ParseUUIDPipe) id: string) {
    return this.users.previewDelete(id);
  }

  @Delete('users/:id')
  @RequirePermissions('admin:users:delete')
  deleteUser(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUserPayload,
    @Query('mode') mode?: 'soft' | 'hard',
  ) {
    return this.users.deleteUser(id, user, mode ?? 'soft');
  }

  @Post('users/bulk-delete')
  @RequirePermissions('admin:users:delete')
  bulkDeleteUsers(
    @Body() dto: BulkDeleteUsersDto,
    @CurrentUser() user: AuthUserPayload,
  ) {
    return this.users.bulkDeleteByEmail(dto.emails, user, dto.mode ?? 'soft');
  }

  @Post('guardians')
  @RequirePermissions('admin:guardians:write')
  createGuardian(
    @Body() dto: CreateGuardianDto,
    @CurrentUser() user: AuthUserPayload,
  ) {
    return this.guardians.create(dto, user);
  }

  @Get('guardians')
  @RequirePermissions('admin:guardians:read')
  listGuardians(@Query() query: ListGuardiansQueryDto) {
    return this.guardians.list(query);
  }

  @Get('guardians/:id')
  @RequirePermissions('admin:guardians:read')
  getGuardian(@Param('id', ParseUUIDPipe) id: string) {
    return this.guardians.getOne(id);
  }

  @Patch('guardians/:id')
  @RequirePermissions('admin:guardians:write')
  updateGuardian(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateGuardianDto,
    @CurrentUser() user: AuthUserPayload,
  ) {
    return this.guardians.update(id, dto, user);
  }

  @Post('guardians/:id/vetting')
  @RequirePermissions('admin:guardians:write')
  upsertVetting(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateVettingDto,
    @CurrentUser() user: AuthUserPayload,
  ) {
    return this.guardians.upsertVetting(id, dto, user);
  }

  @Post('guardians/:id/certifications')
  @RequirePermissions('admin:guardians:write')
  addCertification(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AdminCreateCertificationDto,
    @CurrentUser() user: AuthUserPayload,
  ) {
    return this.guardians.addCertification(id, dto, user);
  }

  @Post('guardians/:id/activate')
  @RequirePermissions('admin:guardians:activate')
  activateGuardian(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUserPayload,
  ) {
    return this.guardians.activate(id, user);
  }

  @Post('guardians/:id/suspend')
  @RequirePermissions('admin:guardians:suspend')
  suspendGuardian(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUserPayload,
  ) {
    return this.guardians.suspend(id, user);
  }

  @Get('verification/organizations')
  @RequirePermissions('admin:verification:read')
  listPendingOrgs() {
    return this.verification.listPendingOrganizations();
  }

  @Get('organizations')
  @RequirePermissions('admin:verification:read')
  listOrganizations(
    @Query() query: PaginationQueryDto,
    @Query('status') status?: VerificationStatus,
    @Query('search') search?: string,
  ) {
    return this.verification.listOrganizations(query, { status, search });
  }

  @Get('verification/documents/:documentId/content')
  @RequirePermissions('admin:verification:read')
  @ApiProduces('application/octet-stream')
  async getVerificationDocumentContent(
    @Param('documentId', ParseUUIDPipe) documentId: string,
    @CurrentUser() user: AuthUserPayload,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { buffer, mimeType } =
      await this.documents.getVerificationDocumentContent(documentId, user);
    res.setHeader('Content-Type', mimeType);
    res.setHeader('Content-Disposition', 'inline');
    return new StreamableFile(buffer);
  }

  @Patch('verification/organizations/:id')
  @RequirePermissions('admin:verification:write')
  reviewOrg(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReviewVerificationDto,
    @CurrentUser() user: AuthUserPayload,
  ) {
    return this.verification.reviewOrganization(
      id,
      dto.status as VerificationStatus,
      user.sub,
      dto.reason,
    );
  }

  @Get('verification/guardians')
  @RequirePermissions('admin:verification:read')
  listPendingGuardians() {
    return this.verification.listPendingGuardians();
  }

  @Patch('verification/guardians/:id')
  @RequirePermissions('admin:verification:write')
  reviewGuardian(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReviewVerificationDto,
    @CurrentUser() user: AuthUserPayload,
  ) {
    return this.verification.reviewGuardian(
      id,
      dto.status as GuardianVerificationStatus,
      user.sub,
    );
  }

  @Patch('verification/certifications/:id')
  @RequirePermissions('admin:verification:write')
  reviewCert(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReviewVerificationDto,
    @CurrentUser() user: AuthUserPayload,
  ) {
    return this.verification.reviewCertification(
      id,
      dto.status as CertificationVerificationStatus,
      user.sub,
    );
  }

  @Get('pricing-rules')
  @RequirePermissions('admin:pricing:read')
  listPricing() {
    return this.pricing.list();
  }

  @Post('pricing-rules')
  @RequirePermissions('admin:pricing:write')
  createPricing(
    @Body() body: CreatePricingRuleDto,
    @CurrentUser() user: AuthUserPayload,
  ) {
    return this.pricing.create(body, user.sub);
  }

  @Patch('pricing-rules/:id')
  @RequirePermissions('admin:pricing:write')
  updatePricing(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: UpdatePricingRuleDto,
    @CurrentUser() user: AuthUserPayload,
  ) {
    return this.pricing.update(id, body, user.sub);
  }

  @Get('invoices')
  @RequirePermissions('admin:invoices:read')
  listInvoices(
    @Query() query: PaginationQueryDto,
    @Query('status') status?: InvoiceStatus,
  ) {
    return this.billing.listAdmin(query, status ? { status } : undefined);
  }

  @Get('payments')
  @RequirePermissions('admin:payments:read')
  listPayments(@Query() query: PaginationQueryDto) {
    const skip = (query.page - 1) * query.limit;
    return this.prisma.payment.findMany({
      skip,
      take: query.limit,
      orderBy: { createdAt: 'desc' },
      include: { invoice: true },
    });
  }

  @Get('audit-logs')
  @RequirePermissions('admin:audit:read')
  searchAudit(
    @Query() query: PaginationQueryDto,
    @Query('actorUserId') actorUserId?: string,
    @Query('entityType') entityType?: string,
  ) {
    return this.audit.search(query, { actorUserId, entityType });
  }

  @Get('analytics/jobs')
  @RequirePermissions('admin:analytics:read')
  jobAnalytics(@Query('district') district?: string) {
    return this.analytics.jobFacts({ district });
  }

  @Get('analytics/guardians')
  @RequirePermissions('admin:analytics:read')
  guardianAnalytics(@Query('guardianId') guardianId?: string) {
    return this.analytics.guardianPerformance(guardianId);
  }

  @Get('analytics/dashboard')
  @RequirePermissions('admin:analytics:read')
  dashboard() {
    return this.analytics.dashboard();
  }
}
