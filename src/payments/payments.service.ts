import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PaymentProvider, PaymentStatus, Prisma } from '@prisma/client';
import { PrimaryLocationSetupPolicy } from '../common/policies/primary-location-setup.policy';
import { AuditService } from '../common/services/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { EmailNotificationService } from '../notifications/email-notification.service';
import { EmailTemplateId } from '../notifications/email-template.ids';

export interface CreatePaymentInput {
  invoiceId: string;
  provider: PaymentProvider;
  amount: Prisma.Decimal | number;
  idempotencyKey: string;
  externalTxnId?: string;
}

@Injectable()
export class PaymentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly locationSetup: PrimaryLocationSetupPolicy,
    private readonly emails: EmailNotificationService,
  ) {}

  async createPayment(input: CreatePaymentInput) {
    const existing = await this.prisma.payment.findUnique({
      where: { idempotencyKey: input.idempotencyKey },
    });
    if (existing) {
      return existing;
    }

    const invoice = await this.prisma.invoice.findUnique({
      where: { id: input.invoiceId },
    });
    if (!invoice) {
      throw new NotFoundException('Invoice not found');
    }

    await this.locationSetup.assertCanBookJobs(invoice.organizationId);

    try {
      const payment = await this.prisma.payment.create({
        data: {
          invoiceId: input.invoiceId,
          provider: input.provider,
          amount: input.amount,
          idempotencyKey: input.idempotencyKey,
          externalTxnId: input.externalTxnId,
          status: PaymentStatus.PENDING,
          currency: invoice.currency,
        },
      });
      await this.audit.log({
        action: 'PAYMENT_CREATED',
        entityType: 'billing.payments',
        entityId: payment.id,
      });
      return payment;
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        const dup = await this.prisma.payment.findFirst({
          where: { idempotencyKey: input.idempotencyKey },
        });
        if (dup) {
          return dup;
        }
        throw new ConflictException('Duplicate payment');
      }
      throw err;
    }
  }

  async confirmPayment(paymentId: string, externalTxnId?: string) {
    const payment = await this.prisma.payment.findUnique({
      where: { id: paymentId },
      include: { invoice: true },
    });
    if (!payment) {
      throw new NotFoundException('Payment not found');
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const p = await tx.payment.update({
        where: { id: payment.id },
        data: {
          status: PaymentStatus.COMPLETED,
          paidAt: new Date(),
          externalTxnId: externalTxnId ?? payment.externalTxnId,
        },
      });
      await tx.invoice.update({
        where: { id: payment.invoiceId },
        data: { status: 'PAID' },
      });
      return p;
    });

    await this.audit.log({
      action: 'PAYMENT_CONFIRMED',
      entityType: 'billing.payments',
      entityId: paymentId,
    });

    const invoice = await this.prisma.invoice.findUnique({
      where: { id: payment.invoiceId },
      include: { job: { select: { referenceNumber: true } } },
    });
    if (invoice) {
      await this.emails.sendToOrgOwners(
        invoice.organizationId,
        EmailTemplateId.BILLING_PAYMENT_CONFIRMED,
        {
          jobReference: invoice.job?.referenceNumber ?? invoice.jobId,
          jobId: invoice.jobId,
          amount: payment.amount.toString(),
          currency: payment.currency,
        },
        { entityType: 'billing.payments', entityId: paymentId },
      );
    }

    return updated;
  }

  async confirmByIdempotencyKey(idempotencyKey: string, externalTxnId?: string) {
    const payment = await this.prisma.payment.findUnique({
      where: { idempotencyKey },
    });
    if (!payment) {
      throw new NotFoundException('Payment not found');
    }
    return this.confirmPayment(payment.id, externalTxnId);
  }
}
