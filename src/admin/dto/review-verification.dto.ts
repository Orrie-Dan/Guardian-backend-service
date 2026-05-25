import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, MaxLength, ValidateIf } from 'class-validator';

export class ReviewVerificationDto {
  @ApiProperty({ enum: ['VERIFIED', 'REJECTED'] })
  @IsIn(['VERIFIED', 'REJECTED'])
  status!: 'VERIFIED' | 'REJECTED';

  @ApiPropertyOptional({ description: 'Required context when rejecting' })
  @ValidateIf((o) => o.status === 'REJECTED')
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
