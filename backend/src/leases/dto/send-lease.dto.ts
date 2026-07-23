import { IsEmail } from 'class-validator';

export class SendLeaseDto {
  // Email арендатора, которому отправляется приглашение.
  @IsEmail()
  invitedEmail!: string;
}
