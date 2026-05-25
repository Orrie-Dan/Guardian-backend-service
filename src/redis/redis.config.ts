import { ConfigService } from '@nestjs/config';

export function isRedisEnabled(config: ConfigService): boolean {
  return config.get<string>('REDIS_ENABLED', 'true') !== 'false';
}

export function parseRedisConnection(config: ConfigService): {
  host: string;
  port: number;
  password?: string;
} {
  const raw = config.get<string>('REDIS_URL', 'redis://127.0.0.1:6379');
  const url = new URL(raw);
  return {
    host: url.hostname || '127.0.0.1',
    port: Number(url.port || 6379),
    password: url.password || undefined,
  };
}
