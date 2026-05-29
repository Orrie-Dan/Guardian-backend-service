import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import { formatSmtpError } from './log-error.util';

@Injectable()
export class SmtpEmailService {
  private readonly logger = new Logger(SmtpEmailService.name);

  constructor(private readonly config: ConfigService) {}

  isConfigured(): boolean {
    return Boolean(
      this.config.get<string>('SMTP_HOST') &&
        this.config.get<string>('SMTP_PORT') &&
        this.config.get<string>('SMTP_FROM'),
    );
  }

  async sendMail({
    to,
    subject,
    text,
    html,
  }: {
    to: string;
    subject: string;
    text: string;
    html?: string;
  }): Promise<void> {
    const host = this.config.get<string>('SMTP_HOST');
    const port = Number(this.config.get<string>('SMTP_PORT', '587'));
    const secure = this.config.get<string>('SMTP_SECURE', 'false') === 'true';
    const user = this.config.get<string>('SMTP_USER');
    const pass = this.config.get<string>('SMTP_PASS');
    const from = this.config.get<string>('SMTP_FROM');

    if (!host || !port || !from) {
      throw new HttpException(
        'SMTP delivery is not configured',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }

    const transporter = nodemailer.createTransport({
      host,
      port,
      secure,
      auth: user && pass ? { user, pass } : undefined,
    });

    this.logger.debug(
      `SMTP sending to=${to} from=${from} host=${host}:${port} subject="${subject}"`,
    );

    try {
      const info = await transporter.sendMail({
        from,
        to,
        subject,
        text,
        ...(html ? { html } : {}),
      });
      this.logger.log(
        `SMTP sent to=${to} messageId=${info.messageId ?? 'n/a'}`,
      );
    } catch (err) {
      const { message, response } = formatSmtpError(err);
      this.logger.warn(
        `SMTP send failed to=${to} from=${from} host=${host}:${port} — ${message}${
          response ? ` | ${response}` : ''
        }`,
      );
      throw new HttpException('Failed to send email', HttpStatus.BAD_GATEWAY);
    }
  }
}
