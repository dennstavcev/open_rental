import {
  IsBoolean,
  IsOptional,
  IsString,
  Length,
  Matches,
} from 'class-validator';

// Персональные данные стороны договора (ADR-0021). Хранятся в
// зашифрованном виде (CryptoService), одна запись на (leaseId, role).
export class PartyInfoDto {
  @Matches(/^\d{4}$/, { message: 'Серия паспорта должна содержать 4 цифры' })
  passportSeries!: string;

  @Matches(/^\d{6}$/, { message: 'Номер паспорта должен содержать 6 цифр' })
  passportNumber!: string;

  @IsString({ message: 'Поле «Кем выдан» должно быть строкой' })
  @Length(5, 200, {
    message: 'Поле «Кем выдан» должно содержать от 5 до 200 символов',
  })
  passportIssuedBy!: string;

  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'Дата рождения должна быть в формате ГГГГ-ММ-ДД',
  })
  birthDate!: string;

  @IsString({ message: 'Адрес регистрации должен быть строкой' })
  @Length(10, 300, {
    message: 'Адрес регистрации должен содержать от 10 до 300 символов',
  })
  registrationAddress!: string;

  @IsOptional()
  @Matches(/^\+7\d{10}$/, {
    message: 'Телефон должен быть в формате +7XXXXXXXXXX',
  })
  phone?: string;
}

export class SavePartyInfoDto extends PartyInfoDto {
  @IsOptional()
  @IsBoolean({ message: 'Некорректное значение согласия' })
  consentAccepted?: boolean;

  @IsOptional()
  @IsString({ message: 'Некорректная версия политики' })
  policyVersion?: string;
}

export interface PartyInfoView extends PartyInfoDto {
  consentAcceptedAt: string | null;
  consentPolicyVersion: string | null;
  currentPolicyVersion: string;
  updatedAt: string;
}

export interface PartyInfoStatusView {
  role: 'landlord' | 'tenant';
  currentPolicyVersion: string;
  self: {
    filled: boolean;
    updatedAt: string | null;
    needsConsent: boolean;
  };
  counterparty: {
    filled: boolean;
    updatedAt: string | null;
  };
}
