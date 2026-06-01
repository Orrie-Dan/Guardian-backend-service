import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  CoordinatePrecision,
  OrgStatus,
  VerificationStatus,
} from '@prisma/client';
import { Transform } from 'class-transformer';
import { IsBoolean, IsEnum, IsOptional, IsString } from 'class-validator';

function toOptionalBoolean(value: unknown): boolean | undefined {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }
  if (value === true || value === 'true' || value === '1') {
    return true;
  }
  if (value === false || value === 'false' || value === '0') {
    return false;
  }
  return undefined;
}

export class MapSitesQueryDto {
  @ApiPropertyOptional({ enum: CoordinatePrecision })
  @IsOptional()
  @IsEnum(CoordinatePrecision)
  coordinatePrecision?: CoordinatePrecision;

  @ApiPropertyOptional({ description: 'Location row status (default ACTIVE)' })
  @IsOptional()
  @IsString()
  locationStatus?: string;

  @ApiPropertyOptional({ enum: OrgStatus })
  @IsOptional()
  @IsEnum(OrgStatus)
  organizationStatus?: OrgStatus;

  @ApiPropertyOptional({ enum: VerificationStatus })
  @IsOptional()
  @IsEnum(VerificationStatus)
  verificationStatus?: VerificationStatus;

  @ApiPropertyOptional({ description: 'Only primary organization sites' })
  @IsOptional()
  @Transform(({ value }) => toOptionalBoolean(value))
  @IsBoolean()
  primaryOnly?: boolean;
}
