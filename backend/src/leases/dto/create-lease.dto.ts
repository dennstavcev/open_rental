import {
  IsDateString,
  IsInt,
  IsNumber,
  Max,
  Min,
} from 'class-validator';

export class CreateLeaseDto {
  // Объект, по которому создаётся договор (должен принадлежать landlord).
  @IsDateString()
  startDate!: string;

  @IsDateString()
  endDate!: string;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  rentAmount!: number;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  depositAmount!: number;

  // День месяца (1–28, чтобы существовать в любом месяце) — дата оплаты.
  @IsInt()
  @Min(1)
  @Max(28)
  paymentDay!: number;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  penaltyRatePercentPerDay!: number;
}
