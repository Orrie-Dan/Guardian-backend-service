import { Invoice, InvoiceStatus, Payment, Prisma } from '@prisma/client';
import { InvoiceLineItem } from './billing-calculation.service';
import {
  ClientInvoiceDetailDto,
  ClientInvoiceSummaryDto,
} from './dto/invoice-detail.dto';

type InvoiceJobContext = {
  referenceNumber?: string;
  status?: string;
};

type InvoiceWithJob = Invoice & {
  job?: InvoiceJobContext;
  payments?: Pick<Payment, 'id' | 'status' | 'provider' | 'amount'>[];
};

function decimalToString(
  value: Prisma.Decimal | null | undefined,
): string | null {
  if (value == null) {
    return null;
  }
  return value.toString();
}

function toIso(value: Date | null | undefined): string | null {
  return value ? value.toISOString() : null;
}

function parseLineItems(raw: Prisma.JsonValue | null): InvoiceLineItem[] {
  if (!raw || !Array.isArray(raw)) {
    return [];
  }
  const items: InvoiceLineItem[] = [];
  for (const entry of raw) {
    if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) {
      continue;
    }
    const row = entry as Record<string, unknown>;
    const code = String(row.code ?? '');
    if (!code) {
      continue;
    }
    items.push({
      code,
      label: String(row.label ?? ''),
      quantity: row.quantity != null ? String(row.quantity) : undefined,
      unitPrice: row.unitPrice != null ? String(row.unitPrice) : undefined,
      amount: row.amount != null ? String(row.amount) : undefined,
    });
  }
  return items;
}

function buildScheduledWindow(invoice: Invoice) {
  return {
    startAt: toIso(invoice.scheduledStartAt),
    endAt: toIso(invoice.scheduledEndAt),
    hours: decimalToString(invoice.scheduledHours),
  };
}

function buildBilling(invoice: Invoice) {
  return {
    basis: invoice.billingBasis,
    policyModel: invoice.billingPolicyModel,
    billableHours: decimalToString(invoice.billableHours),
  };
}

function buildAmounts(invoice: Invoice) {
  return {
    subtotal: invoice.subtotal.toString(),
    tax: invoice.taxAmount.toString(),
    total: invoice.total.toString(),
  };
}

function buildActual(invoice: Invoice) {
  if (!invoice.arrivedAt && !invoice.completedAt && invoice.actualHours == null) {
    return null;
  }
  return {
    arrivedAt: toIso(invoice.arrivedAt),
    completedAt: toIso(invoice.completedAt),
    hours: decimalToString(invoice.actualHours),
  };
}

function buildDispute(invoice: Invoice) {
  if (!invoice.disputeReason || !invoice.disputedAt) {
    return undefined;
  }
  return {
    reason: invoice.disputeReason,
    disputedAt: invoice.disputedAt.toISOString(),
    statusBeforeDispute: invoice.statusBeforeDispute,
    resolvedAt: toIso(invoice.disputeResolvedAt),
    resolutionNote: invoice.disputeResolutionNote,
  };
}

function buildVoid(invoice: Invoice) {
  if (invoice.status !== InvoiceStatus.VOID && !invoice.voidReason) {
    return undefined;
  }
  if (!invoice.voidReason) {
    return undefined;
  }
  return {
    reason: invoice.voidReason,
    replacementInvoiceId: invoice.replacementInvoiceId,
  };
}

function buildJobContext(invoice: InvoiceWithJob) {
  const job = invoice.job;
  return {
    referenceNumber: job?.referenceNumber ?? invoice.jobId,
    status: job?.status ?? 'UNKNOWN',
  };
}

export function toClientInvoiceDetail(
  invoice: InvoiceWithJob,
): ClientInvoiceDetailDto {
  const detail: ClientInvoiceDetailDto = {
    id: invoice.id,
    organizationId: invoice.organizationId,
    jobId: invoice.jobId,
    job: buildJobContext(invoice),
    status: invoice.status,
    currency: invoice.currency,
    scheduledWindow: buildScheduledWindow(invoice),
    actual: buildActual(invoice),
    billing: buildBilling(invoice),
    amounts: buildAmounts(invoice),
    lineItems: parseLineItems(invoice.lineItems),
    issuedAt: toIso(invoice.issuedAt),
    dueAt: toIso(invoice.dueAt),
    createdAt: invoice.createdAt.toISOString(),
  };

  const dispute = buildDispute(invoice);
  if (dispute) {
    detail.dispute = dispute;
  }

  const voidInfo = buildVoid(invoice);
  if (voidInfo) {
    detail.void = voidInfo;
  }

  if (invoice.payments?.length) {
    detail.payments = invoice.payments.map((p) => ({
      id: p.id,
      status: p.status,
      provider: p.provider,
      amount: p.amount.toString(),
    }));
  }

  return detail;
}

export function toClientInvoiceSummary(
  invoice: InvoiceWithJob,
): ClientInvoiceSummaryDto {
  return {
    id: invoice.id,
    jobId: invoice.jobId,
    jobReference: invoice.job?.referenceNumber ?? invoice.jobId,
    status: invoice.status,
    currency: invoice.currency,
    amounts: buildAmounts(invoice),
    scheduledWindow: buildScheduledWindow(invoice),
    billing: buildBilling(invoice),
    createdAt: invoice.createdAt.toISOString(),
    issuedAt: toIso(invoice.issuedAt),
  };
}
