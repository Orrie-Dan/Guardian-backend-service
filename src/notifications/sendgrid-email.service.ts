import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SendMailPayload } from './email.types';
import { formatDeliveryError } from './log-error.util';

const SENDGRID_SEND_URL = 'https://api.sendgrid.com/v3/mail/send';
const SEND_TIMEOUT_MS = 15_000;

@Injectable()
export class SendGridEmailService {
  private readonly logger = new Logger(SendGridEmailService.name);

  constructor(private readonly config: ConfigService) {}

  isConfigured(): boolean {
    return Boolean(this.getApiKey() && this.config.get<string>('SMTP_FROM')?.trim());
  }

  async sendMail({ to, subject, text, html }: SendMailPayload): Promise<void> {
    const apiKey = this.getApiKey();
    const from = this.config.get<string>('SMTP_FROM')?.trim();

    if (!apiKey || !from) {
      throw new HttpException(
        'SendGrid delivery is not configured',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }

    const content: Array<{ type: string; value: string }> = [
      { type: 'text/plain', value: text },
    ];
    if (html) {
      content.push({ type: 'text/html', value: html });
    }

    this.logger.debug(
      `SendGrid sending to=${to} from=${from} subject="${subject}"`,
    );

    let response: Response;
    try {
      response = await fetch(SENDGRID_SEND_URL, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          personalizations: [{ to: [{ email: to }] }],
          from: { email: from },
          subject,
          content,
        }),
        signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
      });
    } catch (err) {
      this.logger.warn(
        `SendGrid request failed to=${to} from=${from} — ${formatDeliveryError(err)}`,
      );
      throw new HttpException('Failed to send email', HttpStatus.BAD_GATEWAY);
    }

    if (!response.ok) {
      const body = await response.text();
      this.logger.warn(
        `SendGrid send failed to=${to} from=${from} — ${response.status}${
          body ? ` | ${body.slice(0, 500)}` : ''
        }`,
      );
      throw new HttpException('Failed to send email', HttpStatus.BAD_GATEWAY);
    }

    this.logger.log(`SendGrid sent to=${to} subject="${subject}"`);
  }

  private getApiKey(): string | undefined {
    const explicit = this.config.get<string>('SENDGRID_API_KEY')?.trim();
    if (explicit) {
      return explicit;
    }

    if (this.config.get<string>('EMAIL_PROVIDER', '').toLowerCase() === 'sendgrid') {
      return this.config.get<string>('SMTP_PASS')?.trim() || undefined;
    }

    return undefined;
  }
}
