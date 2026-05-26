import { ApiProperty } from '@nestjs/swagger';
import { OrgVerificationDocumentType } from '@prisma/client';
import { IsEnum } from 'class-validator';

export class RegisterDocumentUploadDto {
  @ApiProperty({ enum: OrgVerificationDocumentType })
  @IsEnum(OrgVerificationDocumentType)
  documentType!: OrgVerificationDocumentType;
}
