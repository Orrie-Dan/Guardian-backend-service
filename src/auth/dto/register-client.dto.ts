import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { OrgType } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsDateString,
  IsEmail,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  Length,
  Matches,
  ValidateNested,
} from 'class-validator';

export class RegisterFirstLocationDto {
  @ApiProperty()
  @IsString()
  name!: string;

  @ApiProperty()
  @IsString()
  district!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  sector?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  cell?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  village?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  address?: string;

  @ApiProperty({ example: -1.9441 })
  @IsNumber()
  latitude!: number;

  @ApiProperty({ example: 30.0619 })
  @IsNumber()
  longitude!: number;
}

export class RegisterClientDto {
  @ApiProperty({ example: '+250788123456' })
  @IsString()
  @Matches(/^\+[1-9]\d{7,14}$/)
  phone!: string;

  @ApiProperty({ example: '123456' })
  @IsString()
  @Length(6, 6)
  code!: string;

  @ApiProperty()
  @IsString()
  fullName!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiProperty()
  @IsString()
  legalName!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  tradingName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  tinNumber?: string;

  @ApiProperty({ enum: OrgType })
  @IsEnum(OrgType)
  orgType!: OrgType;

  @ApiPropertyOptional()
  @IsOptional()
  @ValidateNested()
  @Type(() => RegisterFirstLocationDto)
  firstLocation?: RegisterFirstLocationDto;
}
