import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { BILLING_OPS_SCAN_INTERVAL_MS } from './billing-ops.constants';
import { BillingOpsService } from './billing-ops.service';

@Injectable()
export class BillingOpsAutomationService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(BillingOpsAutomationService.name);
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(private readonly billingOps: BillingOpsService) {}

  onModuleInit(): void {
    if (process.env.NODE_ENV === 'test') {
      return;
    }
    this.timer = setInterval(
      () => void this.runScan(),
      BILLING_OPS_SCAN_INTERVAL_MS,
    );
  }

  onModuleDestroy(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  async runScan() {
    if (this.running) {
      return;
    }
    this.running = true;
    try {
      await this.billingOps.scanBillingAnomalies();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Billing ops scan failed: ${message}`);
    } finally {
      this.running = false;
    }
  }
}
