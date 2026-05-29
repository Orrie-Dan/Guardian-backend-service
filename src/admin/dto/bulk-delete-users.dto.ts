import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsEmail, IsIn, IsOptional, ArrayMaxSize, ArrayMinSize } from 'class-validator';

export class BulkDeleteUsersDto {
  @ApiProperty({
    example: ['guardian@example.com'],
    description: 'User emails to delete (case-insensitive match)',
  })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @IsEmail({}, { each: true })
  emails!: string[];

  @ApiPropertyOptional({ enum: ['soft', 'hard'], default: 'soft' })
  @IsOptional()
  @IsIn(['soft', 'hard'])
  mode?: 'soft' | 'hard';
}
