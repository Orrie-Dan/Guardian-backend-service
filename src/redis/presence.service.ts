import { Injectable } from '@nestjs/common';
import { RedisService } from './redis.service';

export interface GuardianPresence {
  lat: number;
  lng: number;
  speed?: number;
  battery?: number;
  available: boolean;
  updatedAt: string;
}

const PRESENCE_TTL_SEC = 90;
const KEY_PREFIX = 'guardian:presence:';

@Injectable()
export class PresenceService {
  private readonly memory = new Map<string, { payload: GuardianPresence; expiresAt: number }>();

  constructor(private readonly redis: RedisService) {}

  async setPresence(
    guardianId: string,
    data: Omit<GuardianPresence, 'updatedAt'>,
  ): Promise<void> {
    const payload: GuardianPresence = {
      ...data,
      updatedAt: new Date().toISOString(),
    };
    const key = `${KEY_PREFIX}${guardianId}`;
    const json = JSON.stringify(payload);

    const client = this.redis.getClient();
    if (client && this.redis.isEnabled()) {
      await client.setex(key, PRESENCE_TTL_SEC, json);
      return;
    }

    this.memory.set(guardianId, {
      payload,
      expiresAt: Date.now() + PRESENCE_TTL_SEC * 1000,
    });
  }

  async getPresence(guardianId: string): Promise<GuardianPresence | null> {
    const key = `${KEY_PREFIX}${guardianId}`;
    const client = this.redis.getClient();

    if (client && this.redis.isEnabled()) {
      const raw = await client.get(key);
      if (!raw) {
        return null;
      }
      return JSON.parse(raw) as GuardianPresence;
    }

    const entry = this.memory.get(guardianId);
    if (!entry || Date.now() > entry.expiresAt) {
      this.memory.delete(guardianId);
      return null;
    }
    return entry.payload;
  }

  async isReachable(guardianId: string): Promise<boolean> {
    const presence = await this.getPresence(guardianId);
    return presence !== null && presence.available;
  }

  async filterReachableGuardianIds(guardianIds: string[]): Promise<string[]> {
    const results: string[] = [];
    for (const id of guardianIds) {
      if (await this.isReachable(id)) {
        results.push(id);
      }
    }
    return results;
  }
}
