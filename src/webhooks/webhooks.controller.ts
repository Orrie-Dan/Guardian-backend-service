import { Body, Controller, Param, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../auth/decorators/public.decorator';
import { PaymentsService } from '../payments/payments.service';

@ApiTags('webhooks')
@Controller('webhooks')
export class WebhooksController {
  constructor(private readonly payments: PaymentsService) {}

  @Public()
  @Post('payments/:provider')
  @ApiOperation({ summary: 'Payment provider webhook (signature TBD)' })
  handlePayment(
    @Param('provider') provider: string,
    @Body()
    body: { idempotencyKey: string; externalTxnId?: string },
  ) {
    return this.payments.confirmByIdempotencyKey(
      body.idempotencyKey,
      body.externalTxnId,
    );
  }
}
