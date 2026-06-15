import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { HttpException } from '@nestjs/common';
import { SendGridEmailService } from './sendgrid-email.service';

describe('SendGridEmailService', () => {
  let service: SendGridEmailService;
  const config = {
    get: jest.fn((key: string) => {
      const values: Record<string, string> = {
        SENDGRID_API_KEY: 'SG.test-key',
        SMTP_FROM: 'sender@example.com',
      };
      return values[key];
    }),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    global.fetch = jest.fn() as jest.Mock;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SendGridEmailService,
        { provide: ConfigService, useValue: config },
      ],
    }).compile();

    service = module.get(SendGridEmailService);
  });

  it('isConfigured returns true when api key and from are set', () => {
    expect(service.isConfigured()).toBe(true);
  });

  it('sendMail posts to SendGrid and succeeds on 202', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      status: 202,
      text: async () => '',
    });

    await service.sendMail({
      to: 'user@example.com',
      subject: 'Test',
      text: 'Hello',
      html: '<p>Hello</p>',
    });

    expect(global.fetch).toHaveBeenCalledWith(
      'https://api.sendgrid.com/v3/mail/send',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer SG.test-key',
        }),
      }),
    );
  });

  it('sendMail throws on non-2xx response', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: false,
      status: 403,
      text: async () => 'Forbidden',
    });

    await expect(
      service.sendMail({
        to: 'user@example.com',
        subject: 'Test',
        text: 'Hello',
      }),
    ).rejects.toBeInstanceOf(HttpException);
  });

  it('uses SMTP_PASS when EMAIL_PROVIDER=sendgrid and no SENDGRID_API_KEY', async () => {
    config.get.mockImplementation((key: string) => {
      const values: Record<string, string> = {
        EMAIL_PROVIDER: 'sendgrid',
        SMTP_PASS: 'SG.from-smtp-pass',
        SMTP_FROM: 'sender@example.com',
      };
      return values[key];
    });

    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      status: 202,
      text: async () => '',
    });

    await service.sendMail({
      to: 'user@example.com',
      subject: 'Test',
      text: 'Hello',
    });

    expect(global.fetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer SG.from-smtp-pass',
        }),
      }),
    );
  });
});
