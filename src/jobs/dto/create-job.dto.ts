import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { JobPriority, JobType } from '@prisma/client';
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Min,
} from 'class-validator';

export class CreateJobDto {
  @ApiProperty({ description: 'Organization UUID' })
  @IsUUID()
  organizationId!: string;

  @ApiProperty({ description: 'Location UUID' })
  @IsUUID()
  locationId!: string;

  @ApiProperty({ enum: JobType })
  @IsEnum(JobType)
  jobType!: JobType;

  @ApiPropertyOptional({ enum: JobPriority, default: JobPriority.STANDARD })
  @IsOptional()
  @IsEnum(JobPriority)
  priority?: JobPriority;

  @ApiProperty({ example: '2025-06-01T14:00:00.000Z' })
  @IsDateString()
  scheduledStart!: string;

  @ApiProperty({ example: '2025-06-01T22:00:00.000Z' })
  @IsDateString()
  scheduledEnd!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  specialInstructions?: string;

  @ApiPropertyOptional({ example: 1, minimum: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  requestedGuardianCount?: number;
}
