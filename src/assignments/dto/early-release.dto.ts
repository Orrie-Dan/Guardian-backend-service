import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class EarlyReleaseRequestDto {
  @ApiProperty({ description: 'Why the guardian is requesting to end the shift early' })
  @IsString()
  @MaxLength(500)
  reason!: string;
}

export class EarlyReleaseRejectDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}
