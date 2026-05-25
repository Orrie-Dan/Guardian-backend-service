import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class NoShowDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  reason?: string;
}
