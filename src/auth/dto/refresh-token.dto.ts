import { ApiProperty } from '@nestjs/swagger';
import { IsString } from 'class-validator';

export class RefreshTokenDto {
  @ApiProperty({
    example:
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwianRpIjoiYWJjZC0xMjM0In0.example',
    description: 'Refresh token from login or previous refresh response',
  })
  @IsString()
  refreshToken!: string;
}
