import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { isRedisEnabled } from './redis.config';

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private client?: Redis;
  private usingRedis = false;
  private readonly memoryRevoked = new Map<string, number>();
  private readonly memoryCache = new Map<string, { value: string; expiresAt: number }>();

  constructor(private readonly config: ConfigService) {}

  async onModuleInit(): Promise<void> {
    if (process.env.NODE_ENV === 'test' || !isRedisEnabled(this.config)) {
      this.logger.warn(
        'Redis disabled — using in-memory token revocation and in-process queues',
      );
      return;
    }

    const url = this.config.get<string>('REDIS_URL', 'redis://127.0.0.1:6379');
    this.client = new Redis(url, {
      maxRetriesPerRequest: null,
      lazyConnect: true,
      enableOfflineQueue: false,
      connectTimeout: 3_000,
      retryStrategy: (times) => (times > 3 ? null : Math.min(times * 200, 2_000)),
    });

    this.client.on('error', (err: Error) => {
      if (this.usingRedis) {
        this.logger.warn(`Redis error: ${err.message}`);
      }
    });

    try {
      await this.client.connect();
      await this.client.ping();
      this.usingRedis = true;
      this.logger.log('Redis connected');
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn(
        `Redis unavailable (${message}) — using in-memory fallback. Start Redis with: docker compose up -d redis`,
      );
      try {
        this.client.disconnect();
      } catch {
        // ignore
      }
      this.client = undefined;
    }
  }

  /** True when BullMQ and Redis-backed revocation are active. */
  isEnabled(): boolean {
    return this.usingRedis;
  }

  /** Use in-process dispatch timers instead of BullMQ. */
  useInProcessMode(): boolean {
    return !this.usingRedis;
  }

  getClient(): Redis | undefined {
    return this.client;
  }

  async revokeRefreshToken(jti: string, ttlSeconds: number): Promise<void> {
    if (!this.usingRedis) {
      this.memoryRevoked.set(jti, Date.now() + ttlSeconds * 1000);
      return;
    }
    await this.client!.setex(`revoked:refresh:${jti}`, ttlSeconds, '1');
  }

  async isRefreshTokenRevoked(jti: string): Promise<boolean> {
    if (!this.usingRedis) {
      const expiresAt = this.memoryRevoked.get(jti);
      if (!expiresAt) {
        return false;
      }
      if (Date.now() > expiresAt) {
        this.memoryRevoked.delete(jti);
        return false;
      }
      return true;
    }
    const result = await this.client!.get(`revoked:refresh:${jti}`);
    return result === '1';
  }

  async cacheGet(key: string): Promise<string | null> {
    if (!this.usingRedis) {
      const entry = this.memoryCache.get(key);
      if (!entry) return null;
      if (Date.now() > entry.expiresAt) {
        this.memoryCache.delete(key);
        return null;
      }
      return entry.value;
    }
    return this.client!.get(key);
  }

  async cacheSet(key: string, value: string, ttlSeconds: number): Promise<void> {
    if (!this.usingRedis) {
      this.memoryCache.set(key, {
        value,
        expiresAt: Date.now() + ttlSeconds * 1000,
      });
      return;
    }
    await this.client!.setex(key, ttlSeconds, value);
  }

  async cacheDelByPrefix(prefix: string): Promise<void> {
    if (!this.usingRedis) {
      for (const key of [...this.memoryCache.keys()]) {
        if (key.startsWith(prefix)) {
          this.memoryCache.delete(key);
        }
      }
      return;
    }
    let cursor = '0';
    do {
      const [next, keys] = await this.client!.scan(
        cursor,
        'MATCH',
        `${prefix}*`,
        'COUNT',
        100,
      );
      cursor = next;
      if (keys.length > 0) {
        await this.client!.del(...keys);
      }
    } while (cursor !== '0');
  }

  async onModuleDestroy(): Promise<void> {
    if (this.client && this.usingRedis) {
      await this.client.quit();
    }
  }
}
