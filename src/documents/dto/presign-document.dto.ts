import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsString, Min } from 'class-validator';

export class PresignDocumentDto {
  @ApiProperty({ example: 'image/jpeg' })
  @IsString()
  mimeType!: string;

  @ApiProperty({ example: 102400 })
  @IsInt()
  @Min(1)
  sizeBytes!: number;
}
