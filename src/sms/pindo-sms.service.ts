import {
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  getPindoCredentials,
  getPindoSmsUrl,
  isPindoEnabled,
} from './pindo.config';

export type PindoSendSmsPayload = {
  to: string;
  text: string;
  sender: string;
};

@Injectable()
export class PindoSmsService {
  private readonly logger = new Logger(PindoSmsService.name);

  constructor(private readonly config: ConfigService) {}

  isConfigured(): boolean {
    if (!isPindoEnabled(this.config)) {
      return false;
    }
    const { token, sender } = getPindoCredentials(this.config);
    return Boolean(token?.trim() && sender?.trim());
  }

  async sendOtp(to: string, code: string): Promise<void> {
    const text = `Your G2 Sentry verification code is ${code}. It expires in 5 minutes.`;
    await this.sendSms({ to, text });
  }

  async sendSms(payload: Pick<PindoSendSmsPayload, 'to' | 'text'>): Promise<void> {
    const { token, sender } = getPindoCredentials(this.config);
    if (!token?.trim() || !sender?.trim()) {
      throw new HttpException(
        'Pindo SMS is not configured (PINDO_API_TOKEN, PINDO_SENDER)',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }

    const url = getPindoSmsUrl(this.config);
    const body: PindoSendSmsPayload = {
      to: payload.to,
      text: payload.text,
      sender: sender.trim(),
    };

    let response: Response;
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token.trim()}`,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify(body),
      });
    } catch (err) {
      this.logger.error(`Pindo SMS request failed: ${String(err)}`);
      throw new HttpException(
        'Failed to send SMS',
        HttpStatus.BAD_GATEWAY,
      );
    }

    const raw = await response.text();
    if (!response.ok) {
      this.logger.warn(
        `Pindo SMS ${response.status}: ${raw.slice(0, 500)}`,
      );
      throw new HttpException(
        'SMS provider rejected the message',
        HttpStatus.BAD_GATEWAY,
      );
    }

    if (raw) {
      this.logger.debug(`Pindo SMS sent to ${payload.to}: ${raw.slice(0, 200)}`);
    }
  }
}
