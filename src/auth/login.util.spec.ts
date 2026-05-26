import { BadRequestException } from '@nestjs/common';
import { parseLoginIdentifier } from './login.util';

describe('parseLoginIdentifier', () => {
  it('parses email (normalized to lowercase)', () => {
    expect(parseLoginIdentifier('  Ops@Company.RW  ')).toEqual({
      type: 'email',
      value: 'ops@company.rw',
    });
  });

  it('parses phone via normalizePhone', () => {
    expect(parseLoginIdentifier('+250788123456')).toEqual({
      type: 'phone',
      value: '+250788123456',
    });
  });

  it('rejects empty login', () => {
    expect(() => parseLoginIdentifier('   ')).toThrow(BadRequestException);
  });

  it('rejects invalid email', () => {
    expect(() => parseLoginIdentifier('not-an-email')).toThrow(BadRequestException);
  });
});
