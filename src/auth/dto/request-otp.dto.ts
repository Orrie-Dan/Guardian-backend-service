import { ApiProperty } from '@nestjs/swagger';
import { IsString, Matches } from 'class-validator';

export class RequestOtpDto {
  @ApiProperty({
    example: '+250788123456',
    description: 'Mobile number (E.164 or local format, 10–15 digits)',
  })
  @IsString()
  @Matches(/^\+[1-9]\d{7,14}$/)
  phone!: string;
}
