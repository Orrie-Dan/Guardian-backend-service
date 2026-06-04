import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { InvoiceStatus } from '@prisma/client';

/** Stable client contract for invoice line breakdown (see invoice-detail.presenter). */
export class InvoiceLineItemDto {
  @ApiProperty({ example: 'billable_hours' })
  code!: string;

  @ApiProperty({ example: 'Billable hours' })
  label!: string;

  @ApiPropertyOptional({ example: '3.00 hrs' })
  quantity?: string;

  @ApiPropertyOptional({ example: '5000' })
  unitPrice?: string;

  @ApiPropertyOptional({ example: '15000' })
  amount?: string;
}

export class InvoiceTimeWindowDto {
  @ApiPropertyOptional({ format: 'date-time' })
  startAt!: string | null;

  @ApiPropertyOptional({ format: 'date-time' })
  endAt!: string | null;

  @ApiPropertyOptional({ example: '8.0000', description: 'Decimal hours as string' })
  hours!: string | null;
}

export class InvoiceActualDto {
  @ApiPropertyOptional({ format: 'date-time' })
  arrivedAt!: string | null;

  @ApiPropertyOptional({ format: 'date-time' })
  completedAt!: string | null;

  @ApiPropertyOptional({ example: '3.0000' })
  hours!: string | null;
}

export class InvoiceBillingDto {
  @ApiPropertyOptional({ example: 'MINIMUM_GUARANTEED' })
  basis!: string | null;

  @ApiPropertyOptional({ example: 'MINIMUM_GUARANTEED' })
  policyModel!: string | null;

  @ApiPropertyOptional({ example: '3.0000' })
  billableHours!: string | null;
}

export class InvoiceAmountsDto {
  @ApiProperty({ example: '15000.00' })
  subtotal!: string;

  @ApiProperty({ example: '2700.00' })
  tax!: string;

  @ApiProperty({ example: '17700.00' })
  total!: string;
}

export class InvoiceJobContextDto {
  @ApiProperty({ example: 'JOB-2026-00042' })
  referenceNumber!: string;

  @ApiProperty({ example: 'AWAITING_CONFIRMATION' })
  status!: string;
}

export class InvoiceDisputeDto {
  @ApiProperty()
  reason!: string;

  @ApiProperty({ format: 'date-time' })
  disputedAt!: string;

  @ApiPropertyOptional()
  statusBeforeDispute?: string | null;

  @ApiPropertyOptional({ format: 'date-time' })
  resolvedAt?: string | null;

  @ApiPropertyOptional()
  resolutionNote?: string | null;
}

export class InvoiceVoidDto {
  @ApiProperty()
  reason!: string;

  @ApiPropertyOptional({ format: 'uuid' })
  replacementInvoiceId?: string | null;
}

export class InvoicePaymentSummaryDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  status!: string;

  @ApiProperty()
  provider!: string;

  @ApiProperty({ example: '17700.00' })
  amount!: string;
}

/** Full invoice transparency payload for detail endpoints. */
export class ClientInvoiceDetailDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  organizationId!: string;

  @ApiProperty({ format: 'uuid' })
  jobId!: string;

  @ApiProperty({ type: InvoiceJobContextDto })
  job!: InvoiceJobContextDto;

  @ApiProperty({ enum: InvoiceStatus })
  status!: InvoiceStatus;

  @ApiProperty({ example: 'RWF' })
  currency!: string;

  @ApiProperty({ type: InvoiceTimeWindowDto })
  scheduledWindow!: InvoiceTimeWindowDto;

  @ApiPropertyOptional({ type: InvoiceActualDto })
  actual!: InvoiceActualDto | null;

  @ApiProperty({ type: InvoiceBillingDto })
  billing!: InvoiceBillingDto;

  @ApiProperty({ type: InvoiceAmountsDto })
  amounts!: InvoiceAmountsDto;

  @ApiProperty({ type: [InvoiceLineItemDto] })
  lineItems!: InvoiceLineItemDto[];

  @ApiPropertyOptional({ type: [InvoicePaymentSummaryDto] })
  payments?: InvoicePaymentSummaryDto[];

  @ApiPropertyOptional({ type: InvoiceDisputeDto })
  dispute?: InvoiceDisputeDto;

  @ApiPropertyOptional({ type: InvoiceVoidDto })
  void?: InvoiceVoidDto;

  @ApiPropertyOptional({ format: 'date-time' })
  issuedAt?: string | null;

  @ApiPropertyOptional({ format: 'date-time' })
  dueAt?: string | null;

  @ApiProperty({ format: 'date-time' })
  createdAt!: string;
}

/** List row for org invoice history. */
export class ClientInvoiceSummaryDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  jobId!: string;

  @ApiProperty({ example: 'JOB-2026-00042' })
  jobReference!: string;

  @ApiProperty({ enum: InvoiceStatus })
  status!: InvoiceStatus;

  @ApiProperty({ example: 'RWF' })
  currency!: string;

  @ApiProperty({ type: InvoiceAmountsDto })
  amounts!: InvoiceAmountsDto;

  @ApiProperty({ type: InvoiceTimeWindowDto })
  scheduledWindow!: InvoiceTimeWindowDto;

  @ApiProperty({ type: InvoiceBillingDto })
  billing!: InvoiceBillingDto;

  @ApiProperty({ format: 'date-time' })
  createdAt!: string;

  @ApiPropertyOptional({ format: 'date-time' })
  issuedAt?: string | null;
}
