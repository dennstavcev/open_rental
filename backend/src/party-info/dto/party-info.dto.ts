import { IsDateString, IsOptional, IsString, MinLength } from 'class-validator';

// Персональные данные стороны договора (ADR-0021). Хранятся в
// зашифрованном виде (CryptoService), одна запись на (leaseId, role).
export class PartyInfoDto {
  @IsString()
  @MinLength(1)
  passportSeries!: string;

  @IsString()
  @MinLength(1)
  passportNumber!: string;

  @IsString()
  @MinLength(1)
  passportIssuedBy!: string;

  @IsDateString()
  birthDate!: string;

  @IsString()
  @MinLength(1)
  registrationAddress!: string;

  @IsOptional()
  @IsString()
  phone?: string;
}
