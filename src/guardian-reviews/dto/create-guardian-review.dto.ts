import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateGuardianReviewDto {
  @ApiProperty({ minimum: 1, maximum: 5, description: 'Star rating from 1 to 5' })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(5)
  rating!: number;

  @ApiPropertyOptional({ maxLength: 1000 })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  comment?: string;

  @ApiPropertyOptional({
    description:
      'Required when the job has more than one completed assignment',
  })
  @IsOptional()
  @IsUUID()
  assignmentId?: string;
}
