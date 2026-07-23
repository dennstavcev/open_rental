import { IsDateString, IsOptional, IsString, MinLength } from 'class-validator';

// Паспортные данные арендатора. Хранятся в зашифрованном виде.
export class TenantInfoDto {
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
