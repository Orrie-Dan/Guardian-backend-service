import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsOptional, IsString, IsUUID } from 'class-validator';

export class AnalyticsBackfillDto {
  @ApiProperty({
    description: 'Inclusive start timestamp (UTC ISO-8601).',
    example: '2026-06-01T00:00:00.000Z',
  })
  @IsDateString()
  from!: string;

  @ApiProperty({
    description: 'Inclusive end timestamp (UTC ISO-8601).',
    example: '2026-06-02T23:59:59.999Z',
  })
  @IsDateString()
  to!: string;

  @ApiPropertyOptional({ example: 'Gasabo', description: 'Optional district filter.' })
  @IsOptional()
  @IsString()
  district?: string;

  @ApiPropertyOptional({
    format: 'uuid',
    description: 'Optional organization filter.',
  })
  @IsOptional()
  @IsUUID()
  organizationId?: string;

  @ApiPropertyOptional({
    format: 'uuid',
    description: 'Optional guardian filter.',
  })
  @IsOptional()
  @IsUUID()
  guardianId?: string;
}
