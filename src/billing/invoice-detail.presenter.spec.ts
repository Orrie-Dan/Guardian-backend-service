import { InvoiceStatus, Prisma } from '@prisma/client';
import {
  toClientInvoiceDetail,
  toClientInvoiceSummary,
} from './invoice-detail.presenter';

describe('invoice-detail.presenter', () => {
  const baseInvoice = {
    id: 'inv-1',
    organizationId: 'org-1',
    jobId: 'job-1',
    subtotal: new Prisma.Decimal(15000),
    taxAmount: new Prisma.Decimal(2700),
    total: new Prisma.Decimal(17700),
    currency: 'RWF',
    status: InvoiceStatus.PENDING_CONFIRMATION,
    scheduledStartAt: new Date('2026-06-01T08:00:00.000Z'),
    scheduledEndAt: new Date('2026-06-01T16:00:00.000Z'),
    arrivedAt: new Date('2026-06-01T08:05:00.000Z'),
    completedAt: new Date('2026-06-01T11:00:00.000Z'),
    scheduledHours: new Prisma.Decimal(8),
    actualHours: new Prisma.Decimal(2.9167),
    billableHours: new Prisma.Decimal(3),
    billingBasis: 'MINIMUM_GUARANTEED',
    billingPolicyModel: 'MINIMUM_GUARANTEED',
    lineItems: [
      { code: 'billable_hours', label: 'Billable hours', quantity: '3.00 hrs' },
    ],
    issuedAt: null,
    dueAt: null,
    voidReason: null,
    replacementInvoiceId: null,
    disputeReason: null,
    disputedAt: null,
    disputedBy: null,
    statusBeforeDispute: null,
    disputeResolvedAt: null,
    disputeResolvedBy: null,
    disputeResolutionNote: null,
    createdAt: new Date('2026-06-01T11:05:00.000Z'),
    job: {
      referenceNumber: 'JOB-001',
      status: 'AWAITING_CONFIRMATION',
      scheduledStart: new Date('2026-06-01T08:00:00.000Z'),
      scheduledEnd: new Date('2026-06-01T16:00:00.000Z'),
    },
  };

  it('maps detail with scheduled, actual, billing, and line items', () => {
    const detail = toClientInvoiceDetail(baseInvoice);

    expect(detail.scheduledWindow).toEqual({
      startAt: '2026-06-01T08:00:00.000Z',
      endAt: '2026-06-01T16:00:00.000Z',
      hours: '8',
    });
    expect(detail.actual).toEqual({
      arrivedAt: '2026-06-01T08:05:00.000Z',
      completedAt: '2026-06-01T11:00:00.000Z',
      hours: '2.9167',
    });
    expect(detail.billing.billableHours).toBe('3');
    expect(detail.lineItems).toHaveLength(1);
    expect(detail.amounts.total).toBe('17700');
    expect(detail.job.referenceNumber).toBe('JOB-001');
  });

  it('includes dispute and void blocks when present', () => {
    const detail = toClientInvoiceDetail({
      ...baseInvoice,
      status: InvoiceStatus.DISPUTED,
      disputeReason: 'Hours wrong',
      disputedAt: new Date('2026-06-02T10:00:00.000Z'),
      statusBeforeDispute: 'ISSUED',
    });

    expect(detail.dispute?.reason).toBe('Hours wrong');
    expect(detail.dispute?.statusBeforeDispute).toBe('ISSUED');

    const voided = toClientInvoiceDetail({
      ...baseInvoice,
      status: InvoiceStatus.VOID,
      voidReason: 'Duplicate',
      replacementInvoiceId: 'inv-2',
    });
    expect(voided.void).toEqual({
      reason: 'Duplicate',
      replacementInvoiceId: 'inv-2',
    });
  });

  it('maps summary for list endpoints', () => {
    const summary = toClientInvoiceSummary(baseInvoice);
    expect(summary.jobReference).toBe('JOB-001');
    expect(summary.billing.basis).toBe('MINIMUM_GUARANTEED');
    expect(summary.amounts.subtotal).toBe('15000');
  });
});
