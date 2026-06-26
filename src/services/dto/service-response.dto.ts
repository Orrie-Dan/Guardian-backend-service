import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { JobType } from '@prisma/client';

export class ServiceResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty({ enum: JobType })
  code!: JobType;

  @ApiProperty({ example: 'Standard Guardian' })
  name!: string;

  @ApiPropertyOptional()
  description?: string | null;

  @ApiProperty({ example: '5000.00', description: 'Admin-controlled hourly rate (RWF)' })
  hourlyRate!: string;

  @ApiProperty({ example: 'RWF' })
  currency!: string;

  @ApiProperty()
  isActive!: boolean;

  @ApiProperty()
  requiresLicense!: boolean;
}

export class BookingPolicyResponseDto {
  @ApiProperty({ example: 2 })
  minimumBookingHours!: number;

  @ApiPropertyOptional({ example: '5000.00', description: 'Lowest active service × minimum hours' })
  minimumCharge!: string | null;

  @ApiProperty({ example: 0.1 })
  nightSurchargeMinPct!: number;

  @ApiProperty({ example: 0.2 })
  nightSurchargeMaxPct!: number;

  @ApiProperty({ example: 0.2 })
  holidaySurchargeMinPct!: number;

  @ApiProperty({ example: 0.3 })
  holidaySurchargeMaxPct!: number;
}
