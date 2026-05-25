import { BadRequestException } from '@nestjs/common';

const E164_REGEX = /^\+[1-9]\d{7,14}$/;

export function normalizePhone(phone: string): string {
  let normalized = phone.trim().replace(/\s+/g, '');
  if (!normalized.startsWith('+')) {
    if (normalized.startsWith('0')) {
      normalized = `+25${normalized.slice(1)}`;
    } else if (normalized.startsWith('250')) {
      normalized = `+${normalized}`;
    } else {
      normalized = `+${normalized}`;
    }
  }
  if (!E164_REGEX.test(normalized)) {
    throw new BadRequestException('Phone must be valid E.164 format (e.g. +250788123456)');
  }
  return normalized;
}
