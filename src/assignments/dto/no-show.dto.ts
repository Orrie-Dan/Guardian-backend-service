import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';

export enum NoShowReasonCode {
  CLIENT_UNREACHABLE = 'CLIENT_UNREACHABLE',
  CLIENT_CANCELLED_AT_DOOR = 'CLIENT_CANCELLED_AT_DOOR',
  ACCESS_BLOCKED = 'ACCESS_BLOCKED',
  CLIENT_NOT_PRESENT = 'CLIENT_NOT_PRESENT',
  SAFETY_RISK = 'SAFETY_RISK',
  OTHER = 'OTHER',
}

export class NoShowDto {
  @ApiProperty({ enum: NoShowReasonCode })
  @IsEnum(NoShowReasonCode)
  reasonCode!: NoShowReasonCode;

  @ApiPropertyOptional({
    maxLength: 500,
    description: 'Free-text context for the no-show report',
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reasonNote?: string;

  @ApiPropertyOptional({
    deprecated: true,
    maxLength: 500,
    description: 'Deprecated alias for reasonNote',
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
