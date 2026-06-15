import { Injectable, Logger } from '@nestjs/common';
import { OrgMemberRole, RoleCode } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { EmailTemplateId, EmailTemplatePayload } from './email-template.ids';
import { renderEmailTemplate } from './email-template.registry';
import { formatDeliveryError } from './log-error.util';
import { EmailDeliveryService } from './email-delivery.service';

export interface EmailSendContext {
  entityType?: string;
  entityId?: string;
  userId?: string;
}

export interface EmailSendResult {
  sent: boolean;
  skipped?: boolean;
  reason?: string;
}

@Injectable()
export class EmailNotificationService {
  private readonly logger = new Logger(EmailNotificationService.name);

  constructor(
    private readonly email: EmailDeliveryService,
    private readonly prisma: PrismaService,
  ) {}

  /** Best-effort: never throws; logs failures. */
  async sendBestEffort(
    to: string | undefined | null,
    templateId: EmailTemplateId,
    payload: EmailTemplatePayload,
    context?: EmailSendContext,
  ): Promise<EmailSendResult> {
    if (!to?.trim()) {
      return { sent: false, skipped: true, reason: 'no_recipient' };
    }
    if (!this.email.isConfigured()) {
      this.logger.debug(
        `Email skipped (SMTP not configured): ${templateId} ${context?.entityId ?? ''}`,
      );
      return { sent: false, skipped: true, reason: 'smtp_not_configured' };
    }

    const { subject, text, html } = renderEmailTemplate(templateId, payload);
    try {
      await this.email.sendMail({ to: to.trim(), subject, text, html });
      this.logger.log(
        `Email sent: ${templateId} to=${to} entity=${context?.entityType ?? ''}/${context?.entityId ?? ''}`,
      );
      return { sent: true };
    } catch (err) {
      this.logger.warn(
        `Email failed (best-effort): ${templateId} to=${to} — ${formatDeliveryError(err)}`,
      );
      return { sent: false, reason: 'send_failed' };
    }
  }

  async sendToUser(
    userId: string,
    templateId: EmailTemplateId,
    payload: EmailTemplatePayload,
    context?: EmailSendContext,
  ): Promise<EmailSendResult> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { email: true, fullName: true },
    });
    if (!user) {
      return { sent: false, skipped: true, reason: 'user_not_found' };
    }
    return this.sendBestEffort(
      user.email,
      templateId,
      { fullName: user.fullName ?? undefined, ...payload },
      { ...context, userId },
    );
  }

  async sendToOrgOwners(
    organizationId: string,
    templateId: EmailTemplateId,
    payload: EmailTemplatePayload,
    context?: EmailSendContext,
  ): Promise<EmailSendResult[]> {
    const org = await this.prisma.organization.findUnique({
      where: { id: organizationId },
      select: { legalName: true, tradingName: true },
    });
    const owners = await this.prisma.organizationUser.findMany({
      where: { organizationId, role: OrgMemberRole.CLIENT_OWNER },
      include: { user: { select: { id: true, email: true, fullName: true } } },
    });

    const orgName = org?.tradingName ?? org?.legalName ?? 'your organization';
    const results: EmailSendResult[] = [];

    for (const membership of owners) {
      results.push(
        await this.sendBestEffort(
          membership.user.email,
          templateId,
          {
            organizationName: orgName,
            fullName: membership.user.fullName ?? undefined,
            ...payload,
          },
          { ...context, userId: membership.user.id },
        ),
      );
    }
    return results;
  }

  async sendToOpsAdmins(
    templateId: EmailTemplateId,
    payload: EmailTemplatePayload,
    context?: EmailSendContext,
  ): Promise<EmailSendResult[]> {
    const opsUsers = await this.prisma.user.findMany({
      where: {
        userRoles: {
          some: {
            role: { code: { in: [RoleCode.OPS_ADMIN, RoleCode.SUPER_ADMIN] } },
          },
        },
      },
      select: { id: true, email: true, fullName: true },
    });

    const results: EmailSendResult[] = [];
    for (const user of opsUsers) {
      results.push(
        await this.sendBestEffort(
          user.email,
          templateId,
          { fullName: user.fullName ?? undefined, ...payload },
          { ...context, userId: user.id },
        ),
      );
    }
    return results;
  }

  async sendToGuardianUser(
    guardianId: string,
    templateId: EmailTemplateId,
    payload: EmailTemplatePayload,
    context?: EmailSendContext,
  ): Promise<EmailSendResult> {
    const guardian = await this.prisma.guardian.findUnique({
      where: { id: guardianId },
      include: { user: { select: { id: true, email: true, fullName: true } } },
    });
    if (!guardian?.user) {
      return { sent: false, skipped: true, reason: 'guardian_not_found' };
    }
    return this.sendBestEffort(
      guardian.user.email,
      templateId,
      { fullName: guardian.user.fullName ?? undefined, ...payload },
      { ...context, userId: guardian.user.id },
    );
  }
}
