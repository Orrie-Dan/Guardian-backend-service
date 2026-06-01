import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { Prisma } from '@prisma/client';
import { PresenceService } from '../redis/presence.service';
import { PrismaService } from '../prisma/prisma.service';
import { GuardianLocationService } from './guardian-location.service';

describe('GuardianLocationService', () => {
  let service: GuardianLocationService;

  const prisma = {
    guardian: { findUnique: jest.fn() },
    locationHistory: { findFirst: jest.fn(), findMany: jest.fn(), count: jest.fn() },
  };
  const presence = { getPresence: jest.fn() };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GuardianLocationService,
        { provide: PrismaService, useValue: prisma },
        { provide: PresenceService, useValue: presence },
      ],
    }).compile();

    service = module.get(GuardianLocationService);
    jest.clearAllMocks();
    prisma.guardian.findUnique.mockResolvedValue({ id: 'g1' });
  });

  it('returns presence when available', async () => {
    presence.getPresence.mockResolvedValue({
      lat: -1.94,
      lng: 30.06,
      speed: 10,
      battery: 80,
      available: true,
      updatedAt: '2025-05-29T12:00:00.000Z',
    });

    const result = await service.getCurrent('g1');

    expect(result.source).toBe('presence');
    expect(result.connected).toBe(true);
    expect(result.reachable).toBe(true);
    expect(result.latitude).toBe('-1.94');
    expect(prisma.locationHistory.findFirst).not.toHaveBeenCalled();
  });

  it('falls back to latest history when presence is absent', async () => {
    presence.getPresence.mockResolvedValue(null);
    prisma.locationHistory.findFirst.mockResolvedValue({
      latitude: new Prisma.Decimal('-1.95'),
      longitude: new Prisma.Decimal('30.07'),
      speed: null,
      batteryLevel: 50,
      recordedAt: new Date('2025-05-29T11:00:00.000Z'),
    });

    const result = await service.getCurrent('g1');

    expect(result.source).toBe('history');
    expect(result.connected).toBe(false);
    expect(result.latitude).toBe('-1.95');
    expect(result.recordedAt).toBe('2025-05-29T11:00:00.000Z');
  });

  it('throws when guardian does not exist', async () => {
    prisma.guardian.findUnique.mockResolvedValue(null);
    await expect(service.getCurrent('missing')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
