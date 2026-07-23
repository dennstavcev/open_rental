import { IsDateString, IsNumber, IsOptional, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateReadingDto {
  // Значение, подтверждённое/введённое пользователем (OCR только подсказывает).
  // multipart → приходит строкой, приводим к числу.
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0)
  confirmedValue!: number;

  @IsOptional()
  @IsDateString()
  readingDate?: string;
}
