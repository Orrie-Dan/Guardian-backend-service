import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsNumber, IsOptional, Max, Min } from 'class-validator';

export class UpdateBookingSettingsDto {
  @ApiPropertyOptional({ example: 2 })
  @IsOptional()
  @IsNumber()
  @Min(1)
  minimumBookingHours?: number;

  @ApiPropertyOptional({ example: 0.1 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  nightSurchargeMinPct?: number;

  @ApiPropertyOptional({ example: 0.2 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  nightSurchargeMaxPct?: number;

  @ApiPropertyOptional({ example: 0.2 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  holidaySurchargeMinPct?: number;

  @ApiPropertyOptional({ example: 0.3 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  holidaySurchargeMaxPct?: number;

  @ApiPropertyOptional({ example: 0.8 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  guardianSharePct?: number;

  @ApiPropertyOptional({ example: 0.15 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  platformSharePct?: number;

  @ApiPropertyOptional({ example: 0.03 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  gatewaySharePct?: number;

  @ApiPropertyOptional({ example: 0.02 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  reserveSharePct?: number;

  @ApiPropertyOptional({ example: 0.18 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  vatRate?: number;
}
