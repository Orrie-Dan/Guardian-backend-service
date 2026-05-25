import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MinLength } from 'class-validator';

export class SetPasswordDto {
  @ApiProperty({ minLength: 8 })
  @IsString()
  @MinLength(8)
  password!: string;

  @ApiProperty({ minLength: 8 })
  @IsString()
  @MinLength(8)
  confirmPassword!: string;

  @ApiPropertyOptional({
    description: 'Short-lived token from sign-in when password is not yet set',
  })
  @IsOptional()
  @IsString()
  setupToken?: string;
}
