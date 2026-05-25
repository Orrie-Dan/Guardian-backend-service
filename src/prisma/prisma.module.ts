import { Global, Module } from '@nestjs/common';
import { PrismaSessionService } from './prisma-session.service';
import { PrismaService } from './prisma.service';

@Global()
@Module({
  providers: [PrismaService, PrismaSessionService],
  exports: [PrismaService, PrismaSessionService],
})
export class PrismaModule {}
