import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';

export class SignInPasswordDto {
  @ApiProperty({
    example: '+250788123456',
    description: 'Phone number (E.164) or email address',
  })
  @IsString()
  @MinLength(3)
  login!: string;

  @ApiProperty({ minLength: 8 })
  @IsString()
  @MinLength(8)
  password!: string;
}
