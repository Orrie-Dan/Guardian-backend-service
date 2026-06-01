import { ApiPropertyOptional } from '@nestjs/swagger';
import { GuardianStatus, GuardianVerificationStatus } from '@prisma/client';
import { Transform } from 'class-transformer';
import { IsBoolean, IsEnum, IsOptional } from 'class-validator';

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

export class MapGuardiansQueryDto {
  @ApiPropertyOptional({ enum: GuardianStatus })
  @IsOptional()
  @IsEnum(GuardianStatus)
  status?: GuardianStatus;

  @ApiPropertyOptional({ enum: GuardianVerificationStatus })
  @IsOptional()
  @IsEnum(GuardianVerificationStatus)
  verificationStatus?: GuardianVerificationStatus;

  @ApiPropertyOptional({
    description: 'Only guardians with a recent heartbeat (live presence)',
  })
  @IsOptional()
  @Transform(({ value }) => toOptionalBoolean(value))
  @IsBoolean()
  connectedOnly?: boolean;

  @ApiPropertyOptional({
    description: 'Only guardians on duty (shift AVAILABLE or BUSY)',
  })
  @IsOptional()
  @Transform(({ value }) => toOptionalBoolean(value))
  @IsBoolean()
  onDutyOnly?: boolean;

  @ApiPropertyOptional({
    description: 'Omit guardians with no coordinates (presence or history)',
  })
  @IsOptional()
  @Transform(({ value }) => toOptionalBoolean(value))
  @IsBoolean()
  withLocationOnly?: boolean;
}
