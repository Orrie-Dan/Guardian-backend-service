import { Body, Controller, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiTags } from '@nestjs/swagger';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import { Idempotent } from '../common/decorators/idempotent.decorator';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { PaymentsService } from './payments.service';

@ApiTags('payments')
@ApiBearerAuth()
@Controller('payments')
export class PaymentsController {
  constructor(private readonly payments: PaymentsService) {}

  @Post()
  @Idempotent()
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  @RequirePermissions('payments:create')
  create(@Body() dto: CreatePaymentDto) {
    return this.payments.createPayment(dto);
  }

  @Post(':id/confirm')
  @RequirePermissions('payments:confirm')
  confirm(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: { externalTxnId?: string },
  ) {
    return this.payments.confirmPayment(id, body.externalTxnId);
  }
}
