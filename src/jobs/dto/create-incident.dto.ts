import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IncidentSeverity, IncidentType } from '@prisma/client';
import { IsArray, IsEnum, IsOptional, IsString, IsUUID } from 'class-validator';

export class CreateIncidentDto {
  @ApiProperty({ enum: IncidentType })
  @IsEnum(IncidentType)
  incidentType!: IncidentType;

  @ApiPropertyOptional({ enum: IncidentSeverity, default: IncidentSeverity.LOW })
  @IsOptional()
  @IsEnum(IncidentSeverity)
  severity?: IncidentSeverity;

  @ApiProperty()
  @IsString()
  description!: string;

  @ApiProperty()
  @IsUUID()
  assignmentId!: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  mediaIds?: string[];
}
