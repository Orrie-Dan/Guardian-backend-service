import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

export class RespondOfferDto {
  @ApiProperty({
    example: 'c3d4e5f6-a7b8-9012-cdef-123456789012',
    description: 'Job assignment UUID from the dispatch offer',
  })
  @IsUUID()
  assignmentId!: string;
}
