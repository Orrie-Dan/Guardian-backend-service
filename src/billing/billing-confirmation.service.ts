import { Inject, Injectable, Logger, forwardRef } from '@nestjs/common';
import { AssignmentStatus, JobStatus } from '@prisma/client';
import { JobLifecycleService } from '../jobs/job-lifecycle.service';
import { PrismaService } from '../prisma/prisma.service';
import { BillingService } from './billing.service';
import { isIssuableStatus } from './invoice-status.util';

@Injectable()
export class BillingConfirmationService {
  private readonly logger = new Logger(BillingConfirmationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly lifecycle: JobLifecycleService,
    @Inject(forwardRef(() => BillingService))
    private readonly billing: BillingService,
  ) {}

  async processAutoConfirm(jobId: string): Promise<void> {
    const job = await this.prisma.job.findUnique({
      where: { id: jobId },
      select: { id: true, status: true },
    });
    if (!job) {
      this.logger.warn(`Auto-confirm skipped: job ${jobId} not found`);
      return;
    }

    if (job.status !== JobStatus.AWAITING_CONFIRMATION) {
      return;
    }

    const assignment = await this.prisma.jobAssignment.findFirst({
      where: { jobId, status: AssignmentStatus.COMPLETED },
      select: { id: true },
    });
    if (!assignment) {
      this.logger.warn(`Auto-confirm skipped: no completed assignment for job ${jobId}`);
      return;
    }

    const invoice = await this.prisma.invoice.findUnique({
      where: { jobId },
      select: { id: true, status: true },
    });
    if (!invoice || !isIssuableStatus(invoice.status)) {
      return;
    }

    await this.lifecycle.confirmBilling(jobId);
    await this.billing.issueIfDraft(invoice.id);
  }
}
