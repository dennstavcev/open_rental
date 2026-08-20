import { Controller, Get } from '@nestjs/common';
import {
  PRIVACY_POLICY_HTML,
  PRIVACY_POLICY_UPDATED_AT,
  PRIVACY_POLICY_VERSION,
} from './privacy-policy.const';

export interface PrivacyPolicyView {
  version: string;
  updatedAt: string;
  html: string;
}

@Controller('legal')
export class LegalController {
  // Политика публична: пользователь должен прочитать её до входа и до
  // передачи любых персональных данных.
  @Get('privacy-policy')
  getPrivacyPolicy(): PrivacyPolicyView {
    return {
      version: PRIVACY_POLICY_VERSION,
      updatedAt: PRIVACY_POLICY_UPDATED_AT,
      html: PRIVACY_POLICY_HTML,
    };
  }
}
