import { IsOptional, IsString, MaxLength } from 'class-validator';

// Реквизиты для перевода арендной платы (ADR-0019). Все поля
// необязательные: арендодатель заполняет то, чем реально пользуется.
// Пустая строка — способ очистить поле. Отдельного поля под номер карты
// сознательно нет, см. ADR-0019 и PRODUCT_QUESTIONS 7.5.
export class UpdatePayoutDetailsDto {
  @IsOptional()
  @IsString()
  @MaxLength(32)
  payoutPhone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  payoutBankName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  payoutNote?: string;
}
