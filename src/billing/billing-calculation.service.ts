import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import {
  BillingPolicy,
  BillingPolicyModel,
  EarlyReleaseResolution,
  Job,
  JobAssignment,
  JobType,
  PricingModel,
  Prisma,
} from '@prisma/client';
import {
  effectiveBillingModelForInvoice,
  isEarlyReleaseApproved,
} from '../assignments/early-release.util';
import {
  BookingPolicySnapshot,
  computeRevenueSplit,
  computeSurchargeMultiplier,
} from '../common/config/booking-policy.config';
import { PrismaService } from '../prisma/prisma.service';

export type BillableDurationResult = {
  scheduledHours: number;
  actualHours: number;
  billableHours: number;
  billingBasis: string;
  minimumHours: number;
};

export type InvoiceLineItem = {
  code: string;
  label: string;
  quantity?: string;
  unitPrice?: string;
  amount?: string;
};

export type InvoiceAmountsInput = {
  job: Pick<
    Job,
    | 'scheduledStart'
    | 'scheduledEnd'
    | 'requestedGuardianCount'
    | 'billingPolicyModel'
    | 'billingMinimumHours'
    | 'billingProrationEnabled'
  >;
  assignment: Pick<
    JobAssignment,
    'arrivedAt' | 'completedAt' | 'earlyReleaseResolution'
  >;
  policy: Pick<BillingPolicy, 'model' | 'minimumHours' | 'prorationEnabled'>;
  pricingModel: PricingModel;
  hourlyRate: Prisma.Decimal | null;
  replacementHandoff?: boolean;
  flatFee: Prisma.Decimal | null;
  bookingPolicy?: BookingPolicySnapshot;
  serviceName?: string;
  surchargeReasons?: string[];
  surchargeMultiplier?: Prisma.Decimal;
};

export type InvoiceAmountsResult = BillableDurationResult & {
  subtotal: Prisma.Decimal;
  lineItems: InvoiceLineItem[];
};

const MS_PER_HOUR = 1000 * 60 * 60;

@Injectable()
export class BillingCalculationService {
  constructor(private readonly prisma: PrismaService) {}

  async resolveBillingPolicy(
    organizationId: string,
    jobType: JobType,
    scheduledStart: Date,
  ): Promise<BillingPolicy> {
    const policies = await this.prisma.billingPolicy.findMany({
      where: {
        AND: [
          { validFrom: { lte: scheduledStart } },
          {
            OR: [{ validUntil: null }, { validUntil: { gte: scheduledStart } }],
          },
        ],
      },
      orderBy: { priority: 'desc' },
    });

    const match = policies.find((policy) => {
      if (policy.organizationId && policy.organizationId !== organizationId) {
        return false;
      }
      if (policy.jobType && policy.jobType !== jobType) {
        return false;
      }
      return true;
    });

    if (!match) {
      throw new NotFoundException('No billing policy matched');
    }

    return match;
  }

  hoursBetween(start: Date, end: Date): number {
    return Math.max(0, (end.getTime() - start.getTime()) / MS_PER_HOUR);
  }

  computeBillableDuration(
    policyModel: BillingPolicyModel,
    minimumHours: number,
    scheduledStart: Date,
    scheduledEnd: Date,
    arrivedAt: Date,
    completedAt: Date,
  ): BillableDurationResult {
    const scheduledHours = this.hoursBetween(scheduledStart, scheduledEnd);
    const actualHours = this.hoursBetween(arrivedAt, completedAt);
    const minHours = Number(minimumHours);
    const cappedActual = Math.min(scheduledHours, actualHours);

    let billableHours: number;
    switch (policyModel) {
      case BillingPolicyModel.BOOKED_BLOCK:
        billableHours = scheduledHours;
        break;
      case BillingPolicyModel.ACTUAL_TIME:
        billableHours = cappedActual;
        break;
      case BillingPolicyModel.MINIMUM_GUARANTEED:
        billableHours = Math.max(minHours, cappedActual);
        break;
      default:
        billableHours = scheduledHours;
    }

    return {
      scheduledHours,
      actualHours,
      billableHours,
      billingBasis: String(policyModel),
      minimumHours: minHours,
    };
  }

  computeInvoiceAmounts(input: InvoiceAmountsInput): InvoiceAmountsResult {
    const {
      job,
      assignment,
      policy,
      pricingModel,
      hourlyRate,
      flatFee,
      replacementHandoff,
      bookingPolicy,
      serviceName,
      surchargeReasons = [],
      surchargeMultiplier = new Prisma.Decimal(1),
    } = input;

    if (!assignment.arrivedAt || !assignment.completedAt) {
      throw new BadRequestException(
        'Invoice requires assignment arrivedAt and completedAt',
      );
    }

    const baseModel = job.billingPolicyModel ?? policy.model;
    const minimumHours = job.billingMinimumHours
      ? Number(job.billingMinimumHours)
      : Number(policy.minimumHours);
    const prorationEnabled =
      job.billingProrationEnabled ?? policy.prorationEnabled;
    const earlyReleaseApproved = isEarlyReleaseApproved(
      assignment.earlyReleaseResolution,
    );
    const policyModel = effectiveBillingModelForInvoice(
      baseModel,
      earlyReleaseApproved,
      prorationEnabled,
    );

    const duration = this.computeBillableDuration(
      policyModel,
      minimumHours,
      job.scheduledStart,
      job.scheduledEnd,
      assignment.arrivedAt,
      assignment.completedAt,
    );
    if (earlyReleaseApproved && prorationEnabled && policyModel !== baseModel) {
      duration.billingBasis = `${baseModel}_PRORATED_ACTUAL`;
    }

    const guardians = job.requestedGuardianCount;
    let subtotal = new Prisma.Decimal(0);
    const lineItems: InvoiceLineItem[] = [
      {
        code: 'scheduled_window',
        label: 'Scheduled window',
        quantity: `${duration.scheduledHours.toFixed(2)} hrs`,
      },
      {
        code: 'actual_on_site',
        label: 'Actual on-site',
        quantity: `${duration.actualHours.toFixed(2)} hrs`,
      },
      {
        code: 'billing_basis',
        label: 'Billing basis',
        quantity: String(duration.billingBasis),
      },
      ...(earlyReleaseApproved && prorationEnabled
        ? [
            {
              code: 'early_release',
              label: 'Early release',
              quantity: assignment.earlyReleaseResolution ?? 'APPROVED',
            },
          ]
        : []),
      ...(replacementHandoff
        ? [
            {
              code: 'replacement_handoff',
              label: 'Replacement handoff',
              quantity: 'Continuous coverage',
            },
          ]
        : []),
      {
        code: 'billable_hours',
        label: 'Billable hours',
        quantity: `${duration.billableHours.toFixed(2)} hrs`,
      },
    ];

    if (pricingModel === PricingModel.HOURLY && hourlyRate) {
      const effectiveRate = hourlyRate.mul(surchargeMultiplier);
      const grossService = effectiveRate
        .mul(duration.billableHours)
        .mul(guardians);
      subtotal = grossService;

      lineItems.push({
        code: 'service',
        label: serviceName
          ? `${serviceName} (hourly)`
          : 'Guardian service (hourly)',
        quantity: `${duration.billableHours.toFixed(2)} hrs × ${guardians} guardian(s)`,
        unitPrice: effectiveRate.toString(),
        amount: grossService.toString(),
      });

      if (surchargeReasons.length > 0) {
        lineItems.push({
          code: 'surcharge',
          label: 'Schedule surcharges',
          quantity: surchargeReasons.join(', '),
          unitPrice: surchargeMultiplier.toString(),
        });
      }

      if (bookingPolicy) {
        const split = computeRevenueSplit(grossService, bookingPolicy);
        const gPct = Math.round(bookingPolicy.guardianSharePct * 100);
        const pPct = Math.round(bookingPolicy.platformSharePct * 100);
        const gwPct = Math.round(bookingPolicy.gatewaySharePct * 100);
        const rPct = Math.round(bookingPolicy.reserveSharePct * 100);
        lineItems.push(
          {
            code: 'split_guardian',
            label: `Guardian share (${gPct}%)`,
            amount: split.guardian.toString(),
          },
          {
            code: 'split_platform',
            label: `Platform share (${pPct}%)`,
            amount: split.platform.toString(),
          },
          {
            code: 'split_gateway',
            label: `Payment gateway (${gwPct}%)`,
            amount: split.gateway.toString(),
          },
          {
            code: 'split_reserve',
            label: `Operational reserve (${rPct}%)`,
            amount: split.reserve.toString(),
          },
        );
      }
    } else if (pricingModel === PricingModel.FLAT && flatFee) {
      subtotal = flatFee.mul(guardians);
      lineItems.push({
        code: 'service',
        label: 'Guardian service (flat fee)',
        quantity: `${guardians} guardian(s)`,
        unitPrice: flatFee.toString(),
        amount: subtotal.toString(),
      });
    } else {
      throw new NotFoundException('Pricing rule has no applicable rate');
    }

    return { ...duration, subtotal, lineItems };
  }
}
