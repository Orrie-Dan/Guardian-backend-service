import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsISO8601, IsOptional } from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';

export class LocationHistoryQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    description: 'ISO-8601 timestamp; return points recorded at or after this time',
  })
  @IsOptional()
  @IsISO8601()
  since?: string;
}
