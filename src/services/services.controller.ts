import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import { BookingSettingsService } from './booking-settings.service';
import {
  BookingPolicyResponseDto,
  ServiceResponseDto,
} from './dto/service-response.dto';
import { ServicesService } from './services.service';

@ApiTags('services')
@ApiBearerAuth()
@Controller('services')
export class ServicesController {
  constructor(
    private readonly services: ServicesService,
    private readonly bookingSettings: BookingSettingsService,
  ) {}

  @Get()
  @RequirePermissions('services:read')
  @ApiOperation({ summary: 'List active guardian services with live admin pricing' })
  @ApiOkResponse({ type: ServiceResponseDto, isArray: true })
  listActive(): Promise<ServiceResponseDto[]> {
    return this.services.listActive();
  }

  @Get('booking-policy')
  @RequirePermissions('services:read')
  @ApiOperation({ summary: 'Booking rules and minimum charge derived from active services' })
  @ApiOkResponse({ type: BookingPolicyResponseDto })
  async bookingPolicy(): Promise<BookingPolicyResponseDto> {
    const [policy, minimumCharge] = await Promise.all([
      this.bookingSettings.getPolicy(),
      this.bookingSettings.getMinimumChargeFromServices(),
    ]);

    return {
      minimumBookingHours: policy.minimumBookingHours,
      minimumCharge: minimumCharge != null ? minimumCharge.toFixed(2) : null,
      nightSurchargeMinPct: policy.nightSurchargeMinPct,
      nightSurchargeMaxPct: policy.nightSurchargeMaxPct,
      holidaySurchargeMinPct: policy.holidaySurchargeMinPct,
      holidaySurchargeMaxPct: policy.holidaySurchargeMaxPct,
    };
  }
}
