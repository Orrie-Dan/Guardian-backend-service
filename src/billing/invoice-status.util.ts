import { InvoiceStatus } from '@prisma/client';

/** Statuses that may be issued (client confirm or auto-confirm). */
export const ISSUABLE_INVOICE_STATUSES: readonly InvoiceStatus[] = [
  InvoiceStatus.DRAFT,
  InvoiceStatus.PENDING_CONFIRMATION,
];

/** Statuses from which a client may open a dispute. */
export const DISPUTABLE_INVOICE_STATUSES: readonly InvoiceStatus[] = [
  InvoiceStatus.DRAFT,
  InvoiceStatus.PENDING_CONFIRMATION,
  InvoiceStatus.ISSUED,
  InvoiceStatus.OVERDUE,
  InvoiceStatus.PARTIALLY_PAID,
];

export function isIssuableStatus(status: InvoiceStatus): boolean {
  return ISSUABLE_INVOICE_STATUSES.includes(status);
}

export function isDisputableStatus(status: InvoiceStatus): boolean {
  return DISPUTABLE_INVOICE_STATUSES.includes(status);
}

export function blocksPayment(status: InvoiceStatus): boolean {
  return status === InvoiceStatus.DISPUTED || status === InvoiceStatus.DRAFT;
}
