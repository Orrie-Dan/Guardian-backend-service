import { Module } from '@nestjs/common';
import { CommonModule } from '../common/common.module';
import { BillingCalculationService } from './billing-calculation.service';
import { InvoiceViewService } from './invoice-view.service';

/** Policy/duration math and invoice view helpers — no Outbox or Jobs imports (avoids module cycles). */
@Module({
  imports: [CommonModule],
  providers: [BillingCalculationService, InvoiceViewService],
  exports: [BillingCalculationService, InvoiceViewService],
})
export class BillingCoreModule {}
