import { Injectable } from '@nestjs/common';

@Injectable()
export class AppService {
  getHealth() {
    return {
      service: 'g2-sentry-guardian',
      status: 'ok',
      timestamp: new Date().toISOString(),
    };
  }
}
