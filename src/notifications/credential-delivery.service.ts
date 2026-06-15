import { Injectable, Logger } from '@nestjs/common';
import { PindoSmsService } from '../sms/pindo-sms.service';
import { buildRenderedEmail } from './email-layout';
import { formatDeliveryError } from './log-error.util';
import { EmailDeliveryService } from './email-delivery.service';

export type CredentialDeliveryChannel = 'EMAIL' | 'SMS' | 'NONE';

export interface GuardianCredentialPayload {
  fullName: string;
  phoneNumber: string;
  email?: string | null;
  temporaryPassword: string;
}

export interface CredentialDeliveryResult {
  dispatched: boolean;
  channel: CredentialDeliveryChannel;
}

@Injectable()
export class CredentialDeliveryService {
  private readonly logger = new Logger(CredentialDeliveryService.name);

  constructor(
    private readonly email: EmailDeliveryService,
    private readonly sms: PindoSmsService,
  ) {}

  async sendGuardianCredentials(
    payload: GuardianCredentialPayload,
  ): Promise<CredentialDeliveryResult> {
    const login = payload.email || payload.phoneNumber;
    const { subject, text, html } = buildRenderedEmail(
      'Your G2 Sentry guardian account credentials',
      {
        greetingName: payload.fullName,
        paragraphs: ['Your guardian account has been created.'],
        callouts: [
          { label: 'Login', value: login },
          { label: 'Temporary password', value: payload.temporaryPassword },
        ],
        footerNote:
          'For security, sign in and change this password immediately.',
      },
    );

    if (payload.email) {
      try {
        await this.email.sendMail({
          to: payload.email,
          subject,
          text,
          html,
        });
        this.logger.log(
          `Guardian credentials sent by EMAIL to ${payload.email}`,
        );
        return { dispatched: true, channel: 'EMAIL' };
      } catch (err) {
        this.logger.warn(
          `Email credential delivery failed for ${payload.email}: ${formatDeliveryError(err)}; trying SMS fallback`,
        );
      }
    } else {
      this.logger.debug(
        `Guardian credentials: no email on file for ${payload.phoneNumber}, skipping EMAIL`,
      );
    }

    if (this.sms.isConfigured()) {
      this.logger.log(
        `Guardian credentials: sending SMS fallback to ${payload.phoneNumber}`,
      );
      await this.sms.sendSms({
        to: payload.phoneNumber,
        text: [
          `G2 Sentry account ready.`,
          `Login: ${payload.phoneNumber}`,
          `Temp password: ${payload.temporaryPassword}`,
          'Change password after login.',
        ].join(' '),
      });
      this.logger.log(
        `Guardian credentials sent by SMS to ${payload.phoneNumber}`,
      );
      return { dispatched: true, channel: 'SMS' };
    }

    this.logger.warn(
      `Guardian credentials not dispatched for ${payload.phoneNumber} (email failed or missing, SMS not configured)`,
    );
    return { dispatched: false, channel: 'NONE' };
  }
}
