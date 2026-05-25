import { ApiPropertyOptional } from '@nestjs/swagger';
import { OrgType } from '@prisma/client';
import { IsEnum, IsOptional, IsString } from 'class-validator';

export class UpdateOrganizationDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  legalName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  tradingName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  tinNumber?: string;

  @ApiPropertyOptional({ enum: OrgType })
  @IsOptional()
  @IsEnum(OrgType)
  orgType?: OrgType;
}
