import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
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
  IsOptional,
  IsString,
  Matches,
  Min,
} from 'class-validator';

export class CreateGuardianDto {
  @ApiProperty({ example: '+250788123456' })
  @IsString()
  @Matches(/^\+[1-9]\d{7,14}$/)
  phone!: string;

  @ApiProperty()
  @IsString()
  fullName!: string;

  @ApiProperty({ description: 'National ID (Indangamuntu); stored hashed' })
  @IsString()
  nationalId!: string;

  @ApiProperty()
  @IsString()
  districtBase!: string;

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

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  reserveForceNumber?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  rnpReferenceNumber?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  vettingNotes?: string;
}
