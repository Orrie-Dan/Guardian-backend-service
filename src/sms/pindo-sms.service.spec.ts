import { HttpException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { PindoSmsService } from './pindo-sms.service';

describe('PindoSmsService', () => {
  let service: PindoSmsService;
  const configGet = jest.fn();

  beforeEach(async () => {
    configGet.mockReset();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PindoSmsService,
        { provide: ConfigService, useValue: { get: configGet } },
      ],
    }).compile();

    service = module.get(PindoSmsService);
    global.fetch = jest.fn();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('isConfigured is false when PINDO_ENABLED is not true', () => {
    configGet.mockImplementation((key: string, def?: string) => {
      if (key === 'PINDO_ENABLED') return 'false';
      return def;
    });
    expect(service.isConfigured()).toBe(false);
  });

  it('isConfigured is true when enabled with token and sender', () => {
    configGet.mockImplementation((key: string) => {
      const map: Record<string, string> = {
        PINDO_ENABLED: 'true',
        PINDO_API_TOKEN: 'tok',
        PINDO_SENDER: 'G2Sentry',
      };
      return map[key];
    });
    expect(service.isConfigured()).toBe(true);
  });

  it('sendSms posts to Pindo with bearer token', async () => {
    configGet.mockImplementation((key: string, def?: string) => {
      const map: Record<string, string> = {
        PINDO_ENABLED: 'true',
        PINDO_API_TOKEN: 'secret',
        PINDO_SENDER: 'G2Sentry',
        PINDO_API_URL: 'https://api.pindo.io/v1/sms/',
      };
      return map[key] ?? def;
    });

    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => '{"status":"sent"}',
    });

    await service.sendSms({
      to: '+250788123456',
      text: 'Your G2 Sentry verification code is 123456.',
    });

    expect(global.fetch).toHaveBeenCalledWith(
      'https://api.pindo.io/v1/sms/',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer secret',
        }),
        body: JSON.stringify({
          to: '+250788123456',
          text: 'Your G2 Sentry verification code is 123456.',
          sender: 'G2Sentry',
        }),
      }),
    );
  });

  it('sendSms throws when Pindo returns non-2xx', async () => {
    configGet.mockImplementation((key: string) => {
      const map: Record<string, string> = {
        PINDO_API_TOKEN: 'secret',
        PINDO_SENDER: 'G2Sentry',
      };
      return map[key];
    });

    (global.fetch as jest.Mock).mockResolvedValue({
      ok: false,
      status: 401,
      text: async () => 'Unauthorized',
    });

    await expect(
      service.sendSms({ to: '+250788123456', text: 'hi' }),
    ).rejects.toBeInstanceOf(HttpException);
  });
});
