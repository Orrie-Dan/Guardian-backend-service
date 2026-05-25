import { ConflictException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { RoleCode } from '@prisma/client';
import { OtpService } from '../auth/otp.service';
import { AuditService } from '../common/services/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { AdminGuardiansService } from './admin-guardians.service';

describe('AdminGuardiansService', () => {
  let service: AdminGuardiansService;
  const prisma = {
    user: { findUnique: jest.fn(), create: jest.fn() },
    role: { findUnique: jest.fn() },
    guardian: { count: jest.fn(), findUnique: jest.fn(), update: jest.fn() },
    $transaction: jest.fn(),
  };
  const audit = { log: jest.fn() };
  const otp = { requestOtp: jest.fn() };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminGuardiansService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditService, useValue: audit },
        { provide: OtpService, useValue: otp },
      ],
    }).compile();

    service = module.get(AdminGuardiansService);
    jest.clearAllMocks();
  });

  it('create rejects duplicate phone', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 'existing' });
    await expect(
      service.create(
        {
          phone: '+250788000099',
          fullName: 'Test',
          nationalId: '1199080012345678',
          districtBase: 'Gasabo',
        },
        { sub: 'admin-1', roles: [RoleCode.OPS_ADMIN] } as never,
      ),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});
