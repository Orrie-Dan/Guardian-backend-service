import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { EmailDeliveryService } from './email-delivery.service';
import { SendGridEmailService } from './sendgrid-email.service';
import { SmtpEmailService } from './smtp-email.service';

describe('EmailDeliveryService', () => {
  let service: EmailDeliveryService;
  const config = { get: jest.fn() };
  const sendgrid = { isConfigured: jest.fn(), sendMail: jest.fn() };
  const smtp = { isConfigured: jest.fn(), sendMail: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EmailDeliveryService,
        { provide: ConfigService, useValue: config },
        { provide: SendGridEmailService, useValue: sendgrid },
        { provide: SmtpEmailService, useValue: smtp },
      ],
    }).compile();

    service = module.get(EmailDeliveryService);
  });

  it('routes to SendGrid when EMAIL_PROVIDER=sendgrid', async () => {
    config.get.mockImplementation((key: string, defaultValue?: string) => {
      if (key === 'EMAIL_PROVIDER') return 'sendgrid';
      return defaultValue;
    });
    sendgrid.sendMail.mockResolvedValue(undefined);

    await service.sendMail({
      to: 'user@example.com',
      subject: 'Test',
      text: 'Hello',
    });

    expect(sendgrid.sendMail).toHaveBeenCalled();
    expect(smtp.sendMail).not.toHaveBeenCalled();
  });

  it('routes to SMTP when EMAIL_PROVIDER=smtp', async () => {
    config.get.mockImplementation((key: string, defaultValue?: string) => {
      if (key === 'EMAIL_PROVIDER') return 'smtp';
      return defaultValue;
    });
    smtp.sendMail.mockResolvedValue(undefined);

    await service.sendMail({
      to: 'user@example.com',
      subject: 'Test',
      text: 'Hello',
    });

    expect(smtp.sendMail).toHaveBeenCalled();
    expect(sendgrid.sendMail).not.toHaveBeenCalled();
  });

  it('auto-selects SendGrid when SENDGRID_API_KEY is set', async () => {
    config.get.mockImplementation((key: string, defaultValue?: string) => {
      if (key === 'EMAIL_PROVIDER') return '';
      if (key === 'SENDGRID_API_KEY') return 'SG.auto';
      return defaultValue;
    });
    sendgrid.isConfigured.mockReturnValue(true);

    expect(service.isConfigured()).toBe(true);
    expect(sendgrid.isConfigured).toHaveBeenCalled();
    expect(smtp.isConfigured).not.toHaveBeenCalled();
  });
});
