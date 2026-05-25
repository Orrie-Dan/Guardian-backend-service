import { ApiPropertyOptional } from '@nestjs/swagger';
import { GuardianStatus, GuardianVerificationStatus } from '@prisma/client';
import { IsEnum, IsOptional } from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';

export class ListGuardiansQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: GuardianStatus })
  @IsOptional()
  @IsEnum(GuardianStatus)
  status?: GuardianStatus;

  @ApiPropertyOptional({ enum: GuardianVerificationStatus })
  @IsOptional()
  @IsEnum(GuardianVerificationStatus)
  verificationStatus?: GuardianVerificationStatus;
}
