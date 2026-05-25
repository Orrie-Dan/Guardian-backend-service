import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNumber, IsObject, IsOptional, IsString } from 'class-validator';

export class CreateLocationDto {
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

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  operatingHours?: Record<string, string[]>;
}
