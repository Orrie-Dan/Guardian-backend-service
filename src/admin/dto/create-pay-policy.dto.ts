import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { EmploymentType, JobType, PayPolicyModel } from '@prisma/client';
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  Min,
} from 'class-validator';

export class CreatePayPolicyDto {
  @ApiProperty({ example: 1 })
  @IsInt()
  @Min(0)
  priority!: number;

  @ApiPropertyOptional({ enum: JobType })
  @IsOptional()
  @IsEnum(JobType)
  jobType?: JobType;

  @ApiPropertyOptional({ enum: EmploymentType })
  @IsOptional()
  @IsEnum(EmploymentType)
  employmentType?: EmploymentType;

  @ApiProperty({ enum: PayPolicyModel })
  @IsEnum(PayPolicyModel)
  model!: PayPolicyModel;

  @ApiPropertyOptional({ example: 1, description: 'Minimum payable hours floor' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  minimumHours?: number;

  @ApiPropertyOptional({
    default: true,
    description: 'When false, approved early release pays actual time only',
  })
  @IsOptional()
  @IsBoolean()
  applyOnEarlyRelease?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  validFrom?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  validUntil?: string;
}
