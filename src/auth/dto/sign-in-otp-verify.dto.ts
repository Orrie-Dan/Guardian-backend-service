import { ApiProperty } from '@nestjs/swagger';
import { IsString, Length, Matches } from 'class-validator';

export class SignInOtpVerifyDto {
  @ApiProperty({ example: '+250788123456' })
  @IsString()
  @Matches(/^\+[1-9]\d{7,14}$/)
  phone!: string;

  @ApiProperty({ example: '123456' })
  @IsString()
  @Length(6, 6)
  code!: string;
}
