import { Test, TestingModule } from '@nestjs/testing';
import { PindoSmsService } from '../sms/pindo-sms.service';
import { CredentialDeliveryService } from './credential-delivery.service';
import { SmtpEmailService } from './smtp-email.service';

describe('CredentialDeliveryService', () => {
  let service: CredentialDeliveryService;

  const email = { sendMail: jest.fn() };
  const sms = { isConfigured: jest.fn(), sendSms: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CredentialDeliveryService,
        { provide: SmtpEmailService, useValue: email },
        { provide: PindoSmsService, useValue: sms },
      ],
    }).compile();

    service = module.get(CredentialDeliveryService);
  });

  it('uses email first when email is present', async () => {
    email.sendMail.mockResolvedValue(undefined);
    sms.isConfigured.mockReturnValue(true);

    const result = await service.sendGuardianCredentials({
      fullName: 'Guardian',
      phoneNumber: '+250788000099',
      email: 'guardian@example.com',
      temporaryPassword: 'TempPass-123',
    });

    expect(email.sendMail).toHaveBeenCalled();
    expect(sms.sendSms).not.toHaveBeenCalled();
    expect(result).toEqual({ dispatched: true, channel: 'EMAIL' });
  });

  it('falls back to sms when email fails', async () => {
    email.sendMail.mockRejectedValue(new Error('smtp down'));
    sms.isConfigured.mockReturnValue(true);
    sms.sendSms.mockResolvedValue(undefined);

    const result = await service.sendGuardianCredentials({
      fullName: 'Guardian',
      phoneNumber: '+250788000099',
      email: 'guardian@example.com',
      temporaryPassword: 'TempPass-123',
    });

    expect(email.sendMail).toHaveBeenCalled();
    expect(sms.sendSms).toHaveBeenCalled();
    expect(result).toEqual({ dispatched: true, channel: 'SMS' });
  });
});
