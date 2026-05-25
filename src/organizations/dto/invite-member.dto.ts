import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { OrgMemberRole } from '@prisma/client';
import { IsEnum, IsOptional, IsString, Matches } from 'class-validator';

export class InviteMemberDto {
  @ApiProperty({ example: '+250788123456' })
  @IsString()
  @Matches(/^\+[1-9]\d{7,14}$/)
  phoneNumber!: string;

  @ApiProperty({ enum: OrgMemberRole })
  @IsEnum(OrgMemberRole)
  role!: OrgMemberRole;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  email?: string;
}
