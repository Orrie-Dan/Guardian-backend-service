import { BadRequestException, Injectable } from '@nestjs/common';
import * as bcrypt from 'bcrypt';

const BCRYPT_ROUNDS = 12;
const MIN_PASSWORD_LENGTH = 8;

@Injectable()
export class PasswordService {
  async hash(plain: string): Promise<string> {
    this.assertPolicy(plain);
    return bcrypt.hash(plain, BCRYPT_ROUNDS);
  }

  async verify(plain: string, hash: string): Promise<boolean> {
    return bcrypt.compare(plain, hash);
  }

  assertPolicy(plain: string): void {
    if (plain.length < MIN_PASSWORD_LENGTH) {
      throw new BadRequestException(
        `Password must be at least ${MIN_PASSWORD_LENGTH} characters`,
      );
    }
  }

  assertMatch(plain: string, confirm: string): void {
    if (plain !== confirm) {
      throw new BadRequestException('Passwords do not match');
    }
  }
}
