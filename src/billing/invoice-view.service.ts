import { Injectable } from '@nestjs/common';
import { InvoiceStatus, Prisma } from '@prisma/client';
import { AuditService } from '../common/services/audit.service';
import { PrismaService } from '../prisma/prisma.service';

const invoiceViewInclude = {
  payments: true,
  ebmReceipt: true,
  job: true,
} satisfies Prisma.InvoiceInclude;

export type InvoiceViewPayload = Prisma.InvoiceGetPayload<{
  include: typeof invoiceViewInclude;
}>;

@Injectable()
export class InvoiceViewService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /** Moves DRAFT → PENDING_CONFIRMATION when a client first views an invoice. */
  async applyPendingConfirmationOnView(
    invoice: InvoiceViewPayload,
    actorUserId: string,
  ): Promise<InvoiceViewPayload> {
    if (invoice.status !== InvoiceStatus.DRAFT) {
      return invoice;
    }

    const updated = await this.prisma.invoice.update({
      where: { id: invoice.id },
      data: { status: InvoiceStatus.PENDING_CONFIRMATION },
      include: invoiceViewInclude,
    });

    await this.audit.log({
      actorUserId,
      action: 'INVOICE_PENDING_CONFIRMATION',
      entityType: 'billing.invoices',
      entityId: invoice.id,
    });

    return updated;
  }
}
