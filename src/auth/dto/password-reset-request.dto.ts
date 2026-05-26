import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';

export class PasswordResetRequestDto {
  @ApiProperty({
    example: '+250788123456',
    description: 'Phone (E.164) or email for the account. OTP is sent to the registered phone.',
  })
  @IsString()
  @MinLength(3)
  login!: string;
}
