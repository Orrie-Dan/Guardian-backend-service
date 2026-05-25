import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsDateString, IsOptional, IsString, IsUUID } from 'class-validator';

export class CreateVettingDto {
  @ApiProperty()
  @IsDateString()
  vettedAt!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  rnpReferenceNumber?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  clearanceDocumentId?: string;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  reserveForceVerified?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;
}
