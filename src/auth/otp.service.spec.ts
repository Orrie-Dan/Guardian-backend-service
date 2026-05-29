import { Test, TestingModule } from '@nestjs/testing';
import { EmailNotificationService } from '../notifications/email-notification.service';
import { EmailTemplateId } from '../notifications/email-template.ids';
import { PrismaService } from '../prisma/prisma.service';
import { PindoSmsService } from '../sms/pindo-sms.service';
import { OtpService } from './otp.service';

describe('OtpService', () => {
  let service: OtpService;

  const prisma = {
    otpSession: {
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    user: { findUnique: jest.fn() },
  };
  const pindoSms = { isConfigured: jest.fn(), sendOtp: jest.fn() };
  const emails = { sendBestEffort: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OtpService,
        { provide: PrismaService, useValue: prisma },
        { provide: PindoSmsService, useValue: pindoSms },
        { provide: EmailNotificationService, useValue: emails },
      ],
    }).compile();

    service = module.get(OtpService);
    process.env.NODE_ENV = 'test';
  });

  it('sends OTP by SMS and email when user has email', async () => {
    prisma.otpSession.findFirst.mockResolvedValue(null);
    prisma.otpSession.create.mockResolvedValue({
      id: 'otp-1',
      expiresAt: new Date(Date.now() + 300_000),
    });
    prisma.user.findUnique.mockResolvedValue({
      id: 'u1',
      email: 'user@example.com',
      fullName: 'Jean',
    });
    pindoSms.isConfigured.mockReturnValue(true);
    pindoSms.sendOtp.mockResolvedValue(undefined);
    emails.sendBestEffort.mockResolvedValue({ sent: true });

    await service.requestOtp('+250788123456', undefined, undefined, {
      purpose: 'sign_in',
    });

    expect(pindoSms.sendOtp).toHaveBeenCalledWith(
      '+250788123456',
      expect.stringMatching(/^\d{6}$/),
    );
    expect(emails.sendBestEffort).toHaveBeenCalledWith(
      'user@example.com',
      EmailTemplateId.SECURITY_OTP_CODE,
      expect.objectContaining({ purpose: 'sign_in', fullName: 'Jean' }),
      expect.objectContaining({ entityId: 'u1', userId: 'u1' }),
    );
  });

  it('skips email when user has no email on file', async () => {
    prisma.otpSession.findFirst.mockResolvedValue(null);
    prisma.otpSession.create.mockResolvedValue({
      id: 'otp-1',
      expiresAt: new Date(Date.now() + 300_000),
    });
    prisma.user.findUnique.mockResolvedValue({
      id: 'u1',
      email: null,
      fullName: 'Jean',
    });
    pindoSms.isConfigured.mockReturnValue(true);
    pindoSms.sendOtp.mockResolvedValue(undefined);

    await service.requestOtp('+250788123456');

    expect(pindoSms.sendOtp).toHaveBeenCalled();
    expect(emails.sendBestEffort).not.toHaveBeenCalled();
  });
});
