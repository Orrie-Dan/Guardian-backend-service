import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNumber, IsOptional, IsString } from 'class-validator';

export class CompleteSiteDto {
  @ApiProperty({ example: -1.9441 })
  @IsNumber()
  latitude!: number;

  @ApiProperty({ example: 30.0619 })
  @IsNumber()
  longitude!: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  address?: string;
}
