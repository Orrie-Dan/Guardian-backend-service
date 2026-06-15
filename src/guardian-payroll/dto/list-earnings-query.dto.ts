import { ApiPropertyOptional } from '@nestjs/swagger';
import { GuardianEarningStatus } from '@prisma/client';
import { IsDateString, IsEnum, IsOptional } from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';

export class ListEarningsQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  to?: string;

  @ApiPropertyOptional({ enum: GuardianEarningStatus })
  @IsOptional()
  @IsEnum(GuardianEarningStatus)
  status?: GuardianEarningStatus;
}
