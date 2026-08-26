import {
  IsBoolean,
  IsDateString,
  IsNumber,
  IsOptional,
  Min,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';

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

  // multipart-форма присылает строку "true"/"false" — приводим к boolean.
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  confirm?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0)
  expectedPreviousValue?: number;
}
