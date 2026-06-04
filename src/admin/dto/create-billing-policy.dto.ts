import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { BillingPolicyModel, JobType } from '@prisma/client';
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsUUID,
  Min,
} from 'class-validator';

export class CreateBillingPolicyDto {
  @ApiProperty({ example: 1 })
  @IsInt()
  @Min(0)
  priority!: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  organizationId?: string;

  @ApiPropertyOptional({ enum: JobType })
  @IsOptional()
  @IsEnum(JobType)
  jobType?: JobType;

  @ApiProperty({ enum: BillingPolicyModel })
  @IsEnum(BillingPolicyModel)
  model!: BillingPolicyModel;

  @ApiPropertyOptional({ example: 2, description: 'Minimum billable hours (floor)' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  minimumHours?: number;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  prorationEnabled?: boolean;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  allowEarlyRelease?: boolean;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  earlyReleaseRequiresClientApproval?: boolean;

  @ApiPropertyOptional({ description: 'Auto-approve early release after N minutes (phase 3)' })
  @IsOptional()
  @IsInt()
  @Min(1)
  autoApproveAfterMinutes?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  validFrom?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  validUntil?: string;
}
