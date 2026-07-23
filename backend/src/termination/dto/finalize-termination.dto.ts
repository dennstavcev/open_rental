import { IsDateString, IsNumber, IsOptional, Min } from 'class-validator';

export class FinalizeTerminationDto {
  // Кастомная граница последнего периода (иначе — requestedTerminationDate).
  @IsOptional()
  @IsDateString()
  periodEndOverride?: string;

  // Сумма возврата задатка — решает landlord единолично.
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  depositReturnAmount?: number;
}
