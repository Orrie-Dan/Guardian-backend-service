import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsOptional, IsUUID } from 'class-validator';

export class BillingReconciliationQueryDto {
  @ApiProperty({
    description: 'Inclusive start (UTC ISO-8601), filters by assignment completedAt.',
    example: '2026-06-01T00:00:00.000Z',
  })
  @IsDateString()
  from!: string;

  @ApiProperty({
    description: 'Inclusive end (UTC ISO-8601), filters by assignment completedAt.',
    example: '2026-06-30T23:59:59.999Z',
  })
  @IsDateString()
  to!: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  organizationId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  guardianId?: string;
}
