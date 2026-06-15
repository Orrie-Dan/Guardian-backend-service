import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  EmploymentType,
  Gender,
  GuardianSpecialization,
  PreferredShift,
} from '@prisma/client';
import {
  IsArray,
  IsDateString,
  IsEmail,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

export class UpdateGuardianDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  fullName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  districtBase?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  sectorBase?: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  coverageDistricts?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  dateOfBirth?: string;

  @ApiPropertyOptional({ enum: Gender })
  @IsOptional()
  @IsEnum(Gender)
  gender?: Gender;

  @ApiPropertyOptional()
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiPropertyOptional({ enum: EmploymentType })
  @IsOptional()
  @IsEnum(EmploymentType)
  employmentType?: EmploymentType;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  yearsExperience?: number;

  @ApiPropertyOptional({ enum: GuardianSpecialization, isArray: true })
  @IsOptional()
  @IsArray()
  @IsEnum(GuardianSpecialization, { each: true })
  specializations?: GuardianSpecialization[];

  @ApiPropertyOptional({ enum: PreferredShift })
  @IsOptional()
  @IsEnum(PreferredShift)
  preferredShift?: PreferredShift;

  @ApiPropertyOptional({ description: 'Hourly pay rate in pay currency (RWF)' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  hourlyPayRate?: number;
}
