import { Body, Controller, Get, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import { AuthUserPayload } from '../auth/interfaces/auth-user.interface';
import { BillingService } from './billing.service';
import { ClientInvoiceDetailDto } from './dto/invoice-detail.dto';
import { DisputeInvoiceDto } from './dto/dispute-invoice.dto';
import { VoidInvoiceDto } from './dto/void-invoice.dto';

@ApiTags('billing')
@ApiBearerAuth()
@Controller('invoices')
export class BillingController {
  constructor(private readonly billing: BillingService) {}

  @Get(':id')
  @ApiOkResponse({ type: ClientInvoiceDetailDto })
  @RequirePermissions('billing:read')
  getOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUserPayload,
  ) {
    return this.billing.getInvoice(id, user);
  }

  @Post(':id/issue')
  @RequirePermissions('billing:issue')
  issue(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUserPayload,
  ) {
    return this.billing.issue(id, user);
  }

  @Post(':id/dispute')
  @RequirePermissions('billing:dispute')
  dispute(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: DisputeInvoiceDto,
    @CurrentUser() user: AuthUserPayload,
  ) {
    return this.billing.disputeInvoice(id, user, body);
  }

  @Post(':id/void')
  @RequirePermissions('billing:void')
  voidInvoice(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: VoidInvoiceDto,
    @CurrentUser() user: AuthUserPayload,
  ) {
    return this.billing.voidInvoice(id, user, body);
  }
}

