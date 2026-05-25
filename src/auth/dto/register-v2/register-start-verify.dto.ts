import { ApiProperty } from '@nestjs/swagger';
import { IsString, Matches, MinLength } from 'class-validator';

export class RegisterStartVerifyDto {
  @ApiProperty({ example: '+250788123456' })
  @IsString()
  @Matches(/^\+[1-9]\d{7,14}$/)
  phone!: string;

  @ApiProperty({ example: '123456' })
  @IsString()
  @MinLength(4)
  code!: string;
}
