import { ApiProperty } from '@nestjs/swagger';
import { OrgVerificationDocumentType } from '@prisma/client';
import { IsEnum, IsInt, IsString, Length, Min } from 'class-validator';

export class RegisterDocumentPresignDto {
  @ApiProperty()
  @IsString()
  mimeType!: string;

  @ApiProperty()
  @IsInt()
  @Min(1)
  sizeBytes!: number;

  @ApiProperty({ enum: OrgVerificationDocumentType })
  @IsEnum(OrgVerificationDocumentType)
  documentType!: OrgVerificationDocumentType;
}

export class RegisterDocumentConfirmDto {
  @ApiProperty({ enum: OrgVerificationDocumentType })
  @IsEnum(OrgVerificationDocumentType)
  documentType!: OrgVerificationDocumentType;
}

export class RegisterVerifyPhoneConfirmDto {
  @ApiProperty({ example: '123456' })
  @IsString()
  @Length(6, 6)
  code!: string;
}
