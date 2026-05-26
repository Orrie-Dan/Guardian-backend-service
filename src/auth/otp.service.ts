import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { randomInt } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { PindoSmsService } from '../sms/pindo-sms.service';
import { normalizePhone } from './phone.util';

const OTP_TTL_MS = 5 * 60_000;
const OTP_COOLDOWN_MS = 60_000;
const LOCKOUT_MS = 15 * 60_000;
const MAX_ATTEMPTS = 5;

@Injectable()
export class OtpService {
  private readonly logger = new Logger(OtpService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly pindoSms: PindoSmsService,
  ) {}

  async requestOtp(
    phone: string,
    ipAddress?: string,
    deviceFingerprint?: string,
  ) {
    const normalized = this.normalizePhone(phone);
    const recent = await this.prisma.otpSession.findFirst({
      where: { phoneNumber: normalized },
      orderBy: { createdAt: 'desc' },
    });

    if (recent && Date.now() - recent.createdAt.getTime() < OTP_COOLDOWN_MS) {
      throw new HttpException('OTP already sent. Please wait.', HttpStatus.TOO_MANY_REQUESTS);
    }

    if (recent && recent.attempts >= MAX_ATTEMPTS && !recent.verifiedAt) {
      const lockedUntil = new Date(recent.createdAt.getTime() + LOCKOUT_MS);
      if (lockedUntil > new Date()) {
        throw new HttpException('Too many attempts. Try again later.', HttpStatus.TOO_MANY_REQUESTS);
      }
    }

    const code = this.generateCode();
    const otpHash = await bcrypt.hash(code, 10);

    const otp = await this.prisma.otpSession.create({
      data: {
        phoneNumber: normalized,
        otpHash,
        expiresAt: new Date(Date.now() + OTP_TTL_MS),
        ipAddress,
        deviceFingerprint,
      },
    });

    await this.deliverOtp(normalized, code);

    return {
      otpId: otp.id,
      expiresAt: otp.expiresAt,
      ...(process.env.NODE_ENV !== 'production' ? { devCode: code } : {}),
    };
  }

  async verifyOtp(phone: string, code: string) {
    const normalized = this.normalizePhone(phone);
    const otp = await this.prisma.otpSession.findFirst({
      where: {
        phoneNumber: normalized,
        verifiedAt: null,
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!otp) {
      throw new BadRequestException('Invalid or expired OTP');
    }

    if (otp.attempts >= MAX_ATTEMPTS) {
      throw new HttpException('OTP attempts exceeded', HttpStatus.TOO_MANY_REQUESTS);
    }

    const valid = await bcrypt.compare(code, otp.otpHash);
    if (!valid) {
      await this.prisma.otpSession.update({
        where: { id: otp.id },
        data: { attempts: { increment: 1 } },
      });
      throw new BadRequestException('Invalid or expired OTP');
    }

    await this.prisma.otpSession.update({
      where: { id: otp.id },
      data: { verifiedAt: new Date() },
    });

    return normalized;
  }

  private async deliverOtp(phone: string, code: string): Promise<void> {
    if (!this.pindoSms.isConfigured()) {
      if (process.env.NODE_ENV === 'production') {
        throw new HttpException(
          'SMS delivery is not configured',
          HttpStatus.SERVICE_UNAVAILABLE,
        );
      }
      return;
    }

    try {
      await this.pindoSms.sendOtp(phone, code);
    } catch (err) {
      if (process.env.NODE_ENV === 'production') {
        throw err;
      }
      this.logger.warn(
        `Pindo SMS failed in ${process.env.NODE_ENV ?? 'development'}; use devCode from API response`,
      );
    }
  }

  private generateCode(): string {
    return randomInt(100000, 999999).toString();
  }

  private normalizePhone(phone: string): string {
    return normalizePhone(phone);
  }
}
