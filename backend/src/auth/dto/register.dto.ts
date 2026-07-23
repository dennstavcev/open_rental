import { SignupRole } from '@prisma/client';
import { IsEmail, IsEnum, IsString, MinLength } from 'class-validator';

export class RegisterDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(8)
  password!: string;

  @IsString()
  @MinLength(1)
  fullName!: string;

  // Роль выбирается пользователем при регистрации (docs/MVP_SCOPE.md, §7).
  // Сохраняется как onboarding-намерение, не как авторизация.
  @IsEnum(SignupRole)
  signupRole!: SignupRole;
}
