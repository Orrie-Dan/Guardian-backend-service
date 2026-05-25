import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

export class SetContextDto {
  @ApiProperty()
  @IsUUID()
  organizationId!: string;
}
