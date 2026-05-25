import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { OrgType } from '@prisma/client';
import { IsEnum, IsOptional, IsString } from 'class-validator';

export class CreateOrganizationDto {
  @ApiProperty()
  @IsString()
  legalName!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  tradingName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  tinNumber?: string;

  @ApiProperty({ enum: OrgType })
  @IsEnum(OrgType)
  orgType!: OrgType;
}
