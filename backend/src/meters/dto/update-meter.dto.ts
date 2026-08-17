import { MeterType } from '@prisma/client';
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  MinLength,
} from 'class-validator';

// initialReading сюда намеренно не входит — неизменяемая база отсчёта
// (ADR-0014); замена физического прибора — новый Meter, не редактирование.
export class UpdateMeterDto {
  @IsOptional()
  @IsEnum(MeterType)
  meterType?: MeterType;

  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  serialNumber?: string;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  tariff?: number;

  // Вывод счётчика из эксплуатации без удаления истории (ADR-0014).
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  // Дата очередной метрологической поверки — информационно (ADR-0015).
  @IsOptional()
  @IsDateString()
  calibrationDueDate?: string;
}
