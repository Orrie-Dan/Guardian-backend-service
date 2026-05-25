import { Global, Module } from '@nestjs/common';
import { PresenceService } from './presence.service';
import { RedisService } from './redis.service';

@Global()
@Module({
  providers: [RedisService, PresenceService],
  exports: [RedisService, PresenceService],
})
export class RedisModule {}
