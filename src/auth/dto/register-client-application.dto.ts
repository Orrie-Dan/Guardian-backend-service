import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { MobileMoneyProvider, OrgType } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsEmail,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  MinLength,
  ValidateNested,
} from 'class-validator';

export class RegisterClientLocationDto {
  @ApiProperty()
  @IsString()
  name!: string;

  @ApiProperty()
  @IsString()
  district!: string;

  @ApiProperty()
  @IsString()
  address!: string;

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

  @ApiProperty({ example: -1.9441 })
  @IsNumber()
  latitude!: number;

  @ApiProperty({ example: 30.0619 })
  @IsNumber()
  longitude!: number;
}

export class RegisterClientApplicationDto {
  @ApiProperty({ example: '+250788123456' })
  @IsString()
  @Matches(/^\+[1-9]\d{7,14}$/)
  phone!: string;

  @ApiProperty({ minLength: 8 })
  @IsString()
  @MinLength(8)
  password!: string;

  @ApiProperty({ minLength: 8 })
  @IsString()
  @MinLength(8)
  confirmPassword!: string;

  @ApiProperty()
  @IsString()
  fullName!: string;

  @ApiProperty()
  @IsEmail()
  email!: string;

  @ApiProperty()
  @IsString()
  legalName!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  tradingName?: string;

  @ApiProperty()
  @IsString()
  tinNumber!: string;

  @ApiProperty({ enum: OrgType })
  @IsEnum(OrgType)
  orgType!: OrgType;

  @ApiProperty({ enum: MobileMoneyProvider })
  @IsEnum(MobileMoneyProvider)
  mobileMoneyProvider!: MobileMoneyProvider;

  @ApiProperty({ example: '+250788123456' })
  @IsString()
  @Matches(/^\+[1-9]\d{7,14}$/)
  mobileMoneyPhone!: string;

  @ApiProperty()
  @ValidateNested()
  @Type(() => RegisterClientLocationDto)
  location!: RegisterClientLocationDto;
}
