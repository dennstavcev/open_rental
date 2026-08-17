import { MeterType } from '@prisma/client';
import {
  IsDateString,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  MinLength,
} from 'class-validator';

export class CreateMeterDto {
  @IsEnum(MeterType)
  meterType!: MeterType;

  // Пользовательское название — различает счётчики одного типа (ГВС/ХВС,
  // день/ночь) на одном объекте.
  @IsString()
  @MinLength(1)
  name!: string;

  // Серийный номер физического прибора — для сверки/поверки (ADR-0014).
  @IsOptional()
  @IsString()
  @MinLength(1)
  serialNumber?: string;

  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  tariff!: number;

  // Значение на момент постановки на учёт — база для расчёта расхода
  // первого показания (ADR-0014). Обязательно: счётчик почти всегда
  // добавляется уже с накопленным значением.
  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0)
  initialReading!: number;

  // Дата очередной метрологической поверки — информационно (ADR-0015).
  @IsOptional()
  @IsDateString()
  calibrationDueDate?: string;
}
