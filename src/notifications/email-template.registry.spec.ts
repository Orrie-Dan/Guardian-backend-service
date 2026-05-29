import { EmailTemplateId } from './email-template.ids';
import { renderEmailTemplate } from './email-template.registry';

describe('renderEmailTemplate', () => {
  it('renders OTP code email with purpose', () => {
    const email = renderEmailTemplate(EmailTemplateId.SECURITY_OTP_CODE, {
      fullName: 'Jean',
      otpCode: '123456',
      purpose: 'password_reset',
    });
    expect(email.subject).toContain('password reset');
    expect(email.text).toContain('123456');
    expect(email.html).toContain('123456');
  });

  it('renders password reset requested', () => {
    const email = renderEmailTemplate(
      EmailTemplateId.SECURITY_PASSWORD_RESET_REQUESTED,
      { fullName: 'Jean' },
    );
    expect(email.subject).toContain('password reset');
    expect(email.text).toContain('Jean');
    expect(email.html).toContain('Jean');
    expect(email.html).toContain('<!DOCTYPE html>');
  });

  it('renders org rejection with reason', () => {
    const email = renderEmailTemplate(EmailTemplateId.VERIFICATION_ORG_REJECTED, {
      fullName: 'Owner',
      organizationName: 'Acme',
      reason: 'Missing TIN document',
    });
    expect(email.text).toContain('Missing TIN document');
    expect(email.text).toContain('Acme');
    expect(email.html).toContain('Missing TIN document');
    expect(email.html).toContain('Acme');
  });
});
