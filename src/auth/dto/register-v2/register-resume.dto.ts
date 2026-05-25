import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, Matches, MinLength } from 'class-validator';

export class RegisterResumeDto {
  @ApiProperty({ example: '+250788123456' })
  @IsString()
  @Matches(/^\+[1-9]\d{7,14}$/)
  phone!: string;

  @ApiPropertyOptional({ description: 'If set, verifies password instead of sending OTP' })
  @IsOptional()
  @IsString()
  @MinLength(8)
  password?: string;
}
