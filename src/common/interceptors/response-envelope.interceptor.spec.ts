import { StreamableFile } from '@nestjs/common';
import { lastValueFrom, of } from 'rxjs';
import { ResponseEnvelopeInterceptor } from './response-envelope.interceptor';

describe('ResponseEnvelopeInterceptor', () => {
  const interceptor = new ResponseEnvelopeInterceptor();
  const context = {} as never;
  const next = (value: unknown) => ({
    handle: () => of(value),
  });

  it('wraps JSON payloads in the standard envelope', async () => {
    const result = await lastValueFrom(
      interceptor.intercept(context, next({ id: 'org-1' })),
    );
    expect(result).toEqual({
      success: true,
      data: { id: 'org-1' },
      meta: {},
      error: null,
    });
  });

  it('passes StreamableFile through without wrapping', async () => {
    const file = new StreamableFile(Buffer.from('%PDF-1.4'));
    const result = await lastValueFrom(
      interceptor.intercept(context, next(file)),
    );
    expect(result).toBe(file);
  });

  it('passes Buffer through without wrapping', async () => {
    const buffer = Buffer.from('%PDF-1.4');
    const result = await lastValueFrom(
      interceptor.intercept(context, next(buffer)),
    );
    expect(result).toBe(buffer);
  });
});
