import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class JobReferenceService {
  constructor(private readonly prisma: PrismaService) {}

  async nextReference(): Promise<string> {
    const today = new Date();
    const ymd =
      `${today.getUTCFullYear()}` +
      `${String(today.getUTCMonth() + 1).padStart(2, '0')}` +
      `${String(today.getUTCDate()).padStart(2, '0')}`;
    const prefix = `JOB-${ymd}`;
    const count = await this.prisma.job.count({
      where: { referenceNumber: { startsWith: prefix } },
    });
    return `${prefix}${String(count + 1).padStart(4, '0')}`;
  }
}
