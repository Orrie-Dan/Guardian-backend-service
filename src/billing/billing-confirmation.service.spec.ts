import { Test, TestingModule } from '@nestjs/testing';
import { AssignmentStatus, InvoiceStatus, JobStatus } from '@prisma/client';
import { JobLifecycleService } from '../jobs/job-lifecycle.service';
import { PrismaService } from '../prisma/prisma.service';
import { BillingConfirmationService } from './billing-confirmation.service';
import { BillingService } from './billing.service';

describe('BillingConfirmationService', () => {
  let service: BillingConfirmationService;
  const prisma = {
    job: { findUnique: jest.fn() },
    jobAssignment: { findFirst: jest.fn() },
    invoice: { findUnique: jest.fn() },
  };
  const lifecycle = { confirmBilling: jest.fn() };
  const billing = { issueIfDraft: jest.fn() };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BillingConfirmationService,
        { provide: PrismaService, useValue: prisma },
        { provide: JobLifecycleService, useValue: lifecycle },
        { provide: BillingService, useValue: billing },
      ],
    }).compile();

    service = module.get(BillingConfirmationService);
    jest.clearAllMocks();
  });

  it('auto-confirms awaiting job with draft invoice', async () => {
    prisma.job.findUnique.mockResolvedValue({
      id: 'job-1',
      status: JobStatus.AWAITING_CONFIRMATION,
    });
    prisma.jobAssignment.findFirst.mockResolvedValue({ id: 'a-1' });
    prisma.invoice.findUnique.mockResolvedValue({
      id: 'inv-1',
      status: InvoiceStatus.DRAFT,
    });

    await service.processAutoConfirm('job-1');

    expect(lifecycle.confirmBilling).toHaveBeenCalledWith('job-1');
    expect(billing.issueIfDraft).toHaveBeenCalledWith('inv-1');
  });

  it('skips when job is not awaiting confirmation', async () => {
    prisma.job.findUnique.mockResolvedValue({
      id: 'job-1',
      status: JobStatus.COMPLETED,
    });

    await service.processAutoConfirm('job-1');

    expect(lifecycle.confirmBilling).not.toHaveBeenCalled();
  });

  it('auto-confirms when invoice is PENDING_CONFIRMATION', async () => {
    prisma.job.findUnique.mockResolvedValue({
      id: 'job-1',
      status: JobStatus.AWAITING_CONFIRMATION,
    });
    prisma.jobAssignment.findFirst.mockResolvedValue({ id: 'a-1' });
    prisma.invoice.findUnique.mockResolvedValue({
      id: 'inv-1',
      status: InvoiceStatus.PENDING_CONFIRMATION,
    });

    await service.processAutoConfirm('job-1');

    expect(lifecycle.confirmBilling).toHaveBeenCalledWith('job-1');
    expect(billing.issueIfDraft).toHaveBeenCalledWith('inv-1');
  });

  it('skips when invoice is not issuable', async () => {
    prisma.job.findUnique.mockResolvedValue({
      id: 'job-1',
      status: JobStatus.AWAITING_CONFIRMATION,
    });
    prisma.jobAssignment.findFirst.mockResolvedValue({
      id: 'a-1',
      status: AssignmentStatus.COMPLETED,
    });
    prisma.invoice.findUnique.mockResolvedValue({
      id: 'inv-1',
      status: InvoiceStatus.ISSUED,
    });

    await service.processAutoConfirm('job-1');

    expect(lifecycle.confirmBilling).not.toHaveBeenCalled();
  });
});
