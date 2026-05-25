import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { CertificationType } from '@prisma/client';
import { IsDateString, IsEnum, IsOptional, IsString, IsUUID } from 'class-validator';

export class AdminCreateCertificationDto {
  @ApiProperty({ enum: CertificationType })
  @IsEnum(CertificationType)
  certificationType!: CertificationType;

  @ApiProperty()
  @IsString()
  issuer!: string;

  @ApiProperty()
  @IsDateString()
  issueDate!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  expiryDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  documentId?: string;
}
