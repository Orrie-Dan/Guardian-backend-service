import { ApiProperty } from '@nestjs/swagger';
import { MobileMoneyProvider } from '@prisma/client';
import { IsEnum, IsString, Matches } from 'class-validator';

export class PatchRegisterPaymentDto {
  @ApiProperty({ enum: MobileMoneyProvider })
  @IsEnum(MobileMoneyProvider)
  mobileMoneyProvider!: MobileMoneyProvider;

  @ApiProperty({ example: '+250788123456' })
  @IsString()
  @Matches(/^\+[1-9]\d{7,14}$/)
  mobileMoneyPhone!: string;
}
