import { ConfigService } from '@nestjs/config';

export const PINDO_SMS_URL_DEFAULT = 'https://api.pindo.io/v1/sms/';

export function isPindoEnabled(config: ConfigService): boolean {
  return config.get<string>('PINDO_ENABLED', 'false') === 'true';
}

export function getPindoSmsUrl(config: ConfigService): string {
  return config.get<string>('PINDO_API_URL', PINDO_SMS_URL_DEFAULT);
}

export function getPindoCredentials(config: ConfigService): {
  token?: string;
  sender?: string;
} {
  return {
    token: config.get<string>('PINDO_API_TOKEN'),
    sender: config.get<string>('PINDO_SENDER'),
  };
}
