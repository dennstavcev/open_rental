import { LegalController } from './legal.controller';
import {
  PRIVACY_POLICY_HTML,
  PRIVACY_POLICY_VERSION,
  privacyPolicyVersionFor,
} from './privacy-policy.const';

describe('LegalController', () => {
  it('отдаёт публичную политику с версией, содержащей хеш текста', () => {
    const policy = new LegalController().getPrivacyPolicy();

    expect(policy.html.trim()).not.toBe('');
    expect(policy.version).toBe(PRIVACY_POLICY_VERSION);
    expect(policy.version).toMatch(/^2026-08-20-draft\+[a-f0-9]{8}$/);
    expect(policy.version).toBe(privacyPolicyVersionFor(PRIVACY_POLICY_HTML));
  });

  it('любое изменение текста меняет версию', () => {
    expect(privacyPolicyVersionFor(`${PRIVACY_POLICY_HTML} `)).not.toBe(
      PRIVACY_POLICY_VERSION,
    );
  });
});
