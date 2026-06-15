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
import { ApiBearerAuth, ApiProduces, ApiQuery, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import {
  CertificationVerificationStatus,
  GuardianVerificationStatus,
  VerificationStatus,
} from '@prisma/client';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import { AuthUserPayload } from '../auth/interfaces/auth-user.interface';
import { PaginationQueryDto } from '../common/dto/pagination-query.dto';
import { BillingOpsService } from '../billing/billing-ops.service';
import { BillingService } from '../billing/billing.service';
import { AdminAnalyticsService } from './admin-analytics.service';
import { AdminAuditService } from './admin-audit.service';
import { AdminBillingPoliciesService } from './admin-billing-policies.service';
import { AdminPricingService } from './admin-pricing.service';
import { AdminMapService } from './admin-map.service';
import { AdminGuardiansService } from './admin-guardians.service';
import { AdminUsersService } from './admin-users.service';
import { BulkDeleteUsersDto } from './dto/bulk-delete-users.dto';
import { AdminVerificationService } from './admin-verification.service';
import { AdminCreateCertificationDto } from './dto/admin-create-certification.dto';
import { CreateGuardianDto } from './dto/create-guardian.dto';
import { CreateVettingDto } from './dto/create-vetting.dto';
import { ResolveDisputeDto } from '../billing/dto/resolve-dispute.dto';
import { BillingReconciliationQueryDto } from './dto/billing-reconciliation-query.dto';
import { ListAdminInvoicesQueryDto } from './dto/list-admin-invoices-query.dto';
import { ListAuditLogsQueryDto } from './dto/list-audit-logs-query.dto';
import { ListGuardiansQueryDto } from './dto/list-guardians-query.dto';
import { ListOrganizationsQueryDto } from './dto/list-organizations-query.dto';
import { ListVerificationCertificationsQueryDto } from './dto/list-verification-certifications-query.dto';
import { ReviewVerificationDto } from './dto/review-verification.dto';
import { AnalyticsBackfillDto } from './dto/analytics-backfill.dto';
import { CreateBillingPolicyDto } from './dto/create-billing-policy.dto';
import { CreatePricingRuleDto } from './dto/create-pricing-rule.dto';
import { UpdateBillingPolicyDto } from './dto/update-billing-policy.dto';
import { UpdatePricingRuleDto } from './dto/update-pricing-rule.dto';
import { MapGuardiansQueryDto } from './dto/map-guardians-query.dto';
import { MapSitesQueryDto } from './dto/map-sites-query.dto';
import { UpdateGuardianDto } from './dto/update-guardian.dto';
import { LocationHistoryQueryDto } from '../guardians/dto/location-history-query.dto';
import { GuardianLocationService } from '../guardians/guardian-location.service';
import { PrismaService } from '../prisma/prisma.service';
import { DocumentsService } from '../documents/documents.service';
import { DispatchingService } from '../dispatching/dispatching.service';
import { AdminReplacementService } from './admin-replacement.service';
import { ReplacementDenyDto } from '../assignments/dto/replacement.dto';
import { GuardianPayrollService } from '../guardian-payroll/guardian-payroll.service';
import { ListEarningsQueryDto } from '../guardian-payroll/dto/list-earnings-query.dto';
import {
  ConfirmGuardianPayoutDto,
  CreateGuardianPayoutDto,
} from '../guardian-payroll/dto/create-guardian-payout.dto';

@ApiTags('admin')
@ApiBearerAuth()
@Controller('admin')
export class AdminController {
  constructor(
    private readonly map: AdminMapService,
    private readonly guardians: AdminGuardiansService,
    private readonly guardianLocation: GuardianLocationService,
    private readonly users: AdminUsersService,
    private readonly verification: AdminVerificationService,
    private readonly documents: DocumentsService,
    private readonly pricing: AdminPricingService,
    private readonly billingPolicies: AdminBillingPoliciesService,
    private readonly audit: AdminAuditService,
    private readonly analytics: AdminAnalyticsService,
    private readonly billing: BillingService,
    private readonly billingOps: BillingOpsService,
    private readonly prisma: PrismaService,
    private readonly dispatching: DispatchingService,
    private readonly replacement: AdminReplacementService,
    private readonly guardianPayroll: GuardianPayrollService,
  ) {}

  @Get('assignments/replacement-requests')
  @RequirePermissions('admin:assignments:replacement')
  listReplacementRequests() {
    return this.replacement.listPendingRequests();
  }

  @Post('assignments/:id/replacement/approve')
  @RequirePermissions('admin:assignments:replacement')
  approveReplacement(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUserPayload,
  ) {
    return this.replacement.approve(id, user.sub);
  }

  @Post('assignments/:id/replacement/deny')
  @RequirePermissions('admin:assignments:replacement')
  denyReplacement(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReplacementDenyDto,
    @CurrentUser() user: AuthUserPayload,
  ) {
    return this.replacement.deny(id, user.sub, dto.note);
  }

  @Post('jobs/:id/replacement/resume-dispatch')
  @RequirePermissions('admin:assignments:replacement')
  resumeReplacementDispatch(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUserPayload,
  ) {
    return this.replacement.resumeDispatch(id, user.sub);
  }

  @Get('jobs/:id/dispatch-debug')
  @RequirePermissions('admin:analytics:read')
  getJobDispatchDebug(@Param('id', ParseUUIDPipe) id: string) {
    return this.dispatching.getDispatchDebug(id);
  }

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

  @Get('map/guardians')
  @RequirePermissions('admin:guardians:read')
  mapGuardians(@Query() query: MapGuardiansQueryDto) {
    return this.map.listGuardianMarkers(query);
  }

  @Get('map/sites')
  @RequirePermissions('organizations:read')
  mapSites(@Query() query: MapSitesQueryDto) {
    return this.map.listSiteMarkers(query);
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

  @Get('guardians/:id/certifications')
  @RequirePermissions('admin:guardians:read')
  listGuardianCertifications(@Param('id', ParseUUIDPipe) id: string) {
    return this.guardians.listCertificationsForGuardian(id);
  }

  @Get('guardians/:id/location/history')
  @RequirePermissions('admin:guardians:read')
  getGuardianLocationHistory(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: LocationHistoryQueryDto,
  ) {
    const since = query.since ? new Date(query.since) : undefined;
    return this.guardianLocation.getHistory(id, query, since);
  }

  @Get('guardians/:id/location')
  @RequirePermissions('admin:guardians:read')
  getGuardianLocation(@Param('id', ParseUUIDPipe) id: string) {
    return this.guardianLocation.getCurrent(id);
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

  @Get('certifications/:id')
  @RequirePermissions('admin:guardians:read')
  getCertification(@Param('id', ParseUUIDPipe) id: string) {
    return this.guardians.getCertificationById(id);
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

  @Get('guardians/:id/earnings')
  @RequirePermissions('admin:guardian_earnings:read')
  guardianEarnings(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: ListEarningsQueryDto,
  ) {
    return this.guardianPayroll.getLedger(id, query);
  }

  @Post('guardians/:id/payouts')
  @RequirePermissions('admin:guardian_payouts:write')
  createGuardianPayout(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: CreateGuardianPayoutDto,
    @CurrentUser() user: AuthUserPayload,
  ) {
    return this.guardianPayroll.createPayout(id, body, user.sub);
  }

  @Get('guardian-payouts')
  @RequirePermissions('admin:guardian_payouts:read')
  listGuardianPayouts(
    @Query() query: PaginationQueryDto,
    @Query('guardianId') guardianId?: string,
  ) {
    return this.guardianPayroll.listAdminPayouts(query, guardianId);
  }

  @Post('guardian-payouts/:id/confirm')
  @RequirePermissions('admin:guardian_payouts:write')
  confirmGuardianPayout(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: ConfirmGuardianPayoutDto,
  ) {
    return this.guardianPayroll.confirmPayout(id, body.externalTxnId);
  }

  @Get('verification/organizations')
  @RequirePermissions('admin:verification:read')
  listPendingOrgs() {
    return this.verification.listPendingOrganizations();
  }

  @Get('organizations')
  @RequirePermissions('admin:verification:read')
  listOrganizations(@Query() query: ListOrganizationsQueryDto) {
    const { status, search, ...pagination } = query;
    return this.verification.listOrganizations(pagination, { status, search });
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

  @Get('verification/certifications')
  @RequirePermissions('admin:verification:read')
  listVerificationCertifications(
    @Query() query: ListVerificationCertificationsQueryDto,
  ) {
    return this.verification.listCertifications(query);
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

  @Get('billing-policies')
  @RequirePermissions('admin:billing:read')
  listBillingPolicies() {
    return this.billingPolicies.list();
  }

  @Post('billing-policies')
  @RequirePermissions('admin:billing:write')
  createBillingPolicy(
    @Body() body: CreateBillingPolicyDto,
    @CurrentUser() user: AuthUserPayload,
  ) {
    return this.billingPolicies.create(body, user.sub);
  }

  @Patch('billing-policies/:id')
  @RequirePermissions('admin:billing:write')
  updateBillingPolicy(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: UpdateBillingPolicyDto,
    @CurrentUser() user: AuthUserPayload,
  ) {
    return this.billingPolicies.update(id, body, user.sub);
  }

  @Get('billing/reconciliation')
  @RequirePermissions('admin:billing:read')
  billingReconciliation(@Query() query: BillingReconciliationQueryDto) {
    const { from, to, organizationId, guardianId } = query;
    return this.billingOps.getReconciliation({
      from: new Date(from),
      to: new Date(to),
      organizationId,
      guardianId,
    });
  }

  @Get('invoices')
  @RequirePermissions('admin:invoices:read')
  listInvoices(@Query() query: ListAdminInvoicesQueryDto) {
    const { status, ...pagination } = query;
    return this.billing.listAdmin(pagination, status ? { status } : undefined);
  }

  @Post('invoices/:id/resolve-dispute')
  @RequirePermissions('admin:invoices:resolve_dispute')
  resolveInvoiceDispute(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: ResolveDisputeDto,
    @CurrentUser() user: AuthUserPayload,
  ) {
    return this.billing.resolveDispute(id, user.sub, body);
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
  searchAudit(@Query() query: ListAuditLogsQueryDto) {
    const { actorUserId, entityType, ...pagination } = query;
    return this.audit.search(pagination, { actorUserId, entityType });
  }

  @Get('analytics/jobs')
  @RequirePermissions('admin:analytics:read')
  @ApiQuery({ name: 'district', required: false, type: String })
  @ApiQuery({ name: 'from', required: false, type: String })
  @ApiQuery({ name: 'to', required: false, type: String })
  jobAnalytics(
    @Query('district') district?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.analytics.jobFacts({
      district,
      from: from ? new Date(from) : undefined,
      to: to ? new Date(to) : undefined,
    });
  }

  @Get('analytics/guardians')
  @RequirePermissions('admin:analytics:read')
  @ApiQuery({ name: 'guardianId', required: false, type: String })
  guardianAnalytics(@Query('guardianId') guardianId?: string) {
    return this.analytics.guardianPerformance(guardianId);
  }

  @Get('analytics/dashboard')
  @RequirePermissions('admin:analytics:read')
  dashboard() {
    return this.analytics.dashboard();
  }

  @Post('analytics/backfill')
  @RequirePermissions('admin:analytics:read')
  backfillAnalytics(@Body() dto: AnalyticsBackfillDto) {
    return this.analytics.backfill({
      from: new Date(dto.from),
      to: new Date(dto.to),
      district: dto.district,
      organizationId: dto.organizationId,
      guardianId: dto.guardianId,
    });
  }
}
