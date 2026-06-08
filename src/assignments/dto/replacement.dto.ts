import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class ReplacementRequestDto {
  @ApiProperty({ description: 'Why the guardian is requesting a replacement' })
  @IsString()
  @MaxLength(500)
  reason!: string;
}

export class ReplacementDenyDto {
  @ApiPropertyOptional({ description: 'Optional note to the requesting guardian' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}
