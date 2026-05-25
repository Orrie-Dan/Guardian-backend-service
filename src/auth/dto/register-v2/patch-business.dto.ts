import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { OrgType } from '@prisma/client';
import { IsEnum, IsOptional, IsString } from 'class-validator';

export class PatchRegisterBusinessDto {
  @ApiProperty()
  @IsString()
  legalName!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  tradingName?: string;

  @ApiProperty({ enum: OrgType })
  @IsEnum(OrgType)
  orgType!: OrgType;

  @ApiPropertyOptional({ description: 'Required at submit if omitted here' })
  @IsOptional()
  @IsString()
  tinNumber?: string;
}
