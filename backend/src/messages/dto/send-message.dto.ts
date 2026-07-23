import { IsBoolean, IsOptional, IsString, MinLength } from 'class-validator';
import { Transform } from 'class-transformer';

export class SendMessageDto {
  @IsString()
  @MinLength(1)
  body!: string;

  // multipart-форма присылает строку "true"/"false" — приводим к boolean.
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  isOfficial?: boolean;
}
