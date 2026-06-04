import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, IsUUID, MaxLength, ValidateIf } from 'class-validator';

export enum DisputeResolutionAction {
  CLEAR = 'CLEAR',
  VOID = 'VOID',
}

export class ResolveDisputeDto {
  @ApiProperty({ enum: DisputeResolutionAction })
  @IsEnum(DisputeResolutionAction)
  action!: DisputeResolutionAction;

  @ApiPropertyOptional({ maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;

  @ApiPropertyOptional({
    maxLength: 500,
    description: 'Required when action is VOID',
  })
  @ValidateIf((o) => o.action === DisputeResolutionAction.VOID)
  @IsString()
  @MaxLength(500)
  voidReason?: string;

  @ApiPropertyOptional({ description: 'Replacement invoice when voiding' })
  @IsOptional()
  @IsUUID()
  replacementInvoiceId?: string;
}
