import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength } from 'class-validator';

export class DisputeInvoiceDto {
  @ApiProperty({ maxLength: 500, description: 'Why the client disputes this invoice' })
  @IsString()
  @MaxLength(500)
  reason!: string;
}
