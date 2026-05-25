import { ApiProperty } from '@nestjs/swagger';
import { IsString, Length, Matches } from 'class-validator';

export class VerifyOtpDto {
  @ApiProperty({
    example: '+250788123456',
    description: 'Same phone number used in OTP request',
  })
  @IsString()
  @Matches(/^\+[1-9]\d{7,14}$/)
  phone!: string;

  @ApiProperty({
    example: '123456',
    description: '6-digit OTP code',
    minLength: 6,
    maxLength: 6,
  })
  @IsString()
  @Length(6, 6)
  code!: string;
}
