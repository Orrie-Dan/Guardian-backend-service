import { BadRequestException } from '@nestjs/common';
import { normalizePhone } from './phone.util';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type LoginIdentifier =
  | { type: 'email'; value: string }
  | { type: 'phone'; value: string };

/**
 * Parses a single login field as email (contains @) or E.164 phone.
 */
export function parseLoginIdentifier(login: string): LoginIdentifier {
  const trimmed = login.trim();
  if (!trimmed) {
    throw new BadRequestException({
      code: 'INVALID_LOGIN',
      message: 'Login is required',
    });
  }

  if (trimmed.includes('@')) {
    if (!EMAIL_REGEX.test(trimmed)) {
      throw new BadRequestException({
        code: 'INVALID_LOGIN',
        message: 'Invalid email format',
      });
    }
    return { type: 'email', value: trimmed.toLowerCase() };
  }

  return { type: 'phone', value: normalizePhone(trimmed) };
}
