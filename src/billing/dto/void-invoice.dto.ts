import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class VoidInvoiceDto {
  @ApiProperty({ maxLength: 500, description: 'Required reason for voiding the invoice' })
  @IsString()
  @MaxLength(500)
  voidReason!: string;

  @ApiPropertyOptional({
    description: 'Replacement invoice that supersedes this voided invoice',
  })
  @IsOptional()
  @IsUUID()
  replacementInvoiceId?: string;
}
