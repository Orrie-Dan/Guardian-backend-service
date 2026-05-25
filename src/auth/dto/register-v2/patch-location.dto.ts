import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class PatchRegisterLocationDto {
  @ApiProperty()
  @IsString()
  name!: string;

  @ApiProperty({ description: 'Must match a Rwanda district from GET /regions/districts' })
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
}
