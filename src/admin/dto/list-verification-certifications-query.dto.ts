import { ApiPropertyOptional } from '@nestjs/swagger';
import { CertificationVerificationStatus } from '@prisma/client';
import { IsEnum, IsOptional } from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';

export class ListVerificationCertificationsQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    enum: CertificationVerificationStatus,
    default: CertificationVerificationStatus.PENDING,
  })
  @IsOptional()
  @IsEnum(CertificationVerificationStatus)
  verificationStatus?: CertificationVerificationStatus;
}
