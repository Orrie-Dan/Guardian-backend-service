import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SendMailPayload } from './email.types';
import { SendGridEmailService } from './sendgrid-email.service';
import { SmtpEmailService } from './smtp-email.service';

@Injectable()
export class EmailDeliveryService {
  constructor(
    private readonly config: ConfigService,
    private readonly sendgrid: SendGridEmailService,
    private readonly smtp: SmtpEmailService,
  ) {}

  isConfigured(): boolean {
    return this.useSendGrid()
      ? this.sendgrid.isConfigured()
      : this.smtp.isConfigured();
  }

  async sendMail(payload: SendMailPayload): Promise<void> {
    if (this.useSendGrid()) {
      return this.sendgrid.sendMail(payload);
    }
    return this.smtp.sendMail(payload);
  }

  private useSendGrid(): boolean {
    const provider = this.config.get<string>('EMAIL_PROVIDER', '').toLowerCase();
    if (provider === 'sendgrid') {
      return true;
    }
    if (provider === 'smtp') {
      return false;
    }
    return Boolean(this.config.get<string>('SENDGRID_API_KEY')?.trim());
  }
}
