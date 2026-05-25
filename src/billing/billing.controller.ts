import { Controller, Get, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import { AuthUserPayload } from '../auth/interfaces/auth-user.interface';
import { BillingService } from './billing.service';

@ApiTags('billing')
@ApiBearerAuth()
@Controller('invoices')
export class BillingController {
  constructor(private readonly billing: BillingService) {}

  @Get(':id')
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

  @Post(':id/void')
  @RequirePermissions('billing:void')
  voidInvoice(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUserPayload,
  ) {
    return this.billing.voidInvoice(id, user);
  }
}
