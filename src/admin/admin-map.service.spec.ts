import { Test, TestingModule } from '@nestjs/testing';
import { GuardianStatus, ShiftStatus } from '@prisma/client';
import { GuardianLocationService } from '../guardians/guardian-location.service';
import { PrismaService } from '../prisma/prisma.service';
import { AdminMapService } from './admin-map.service';

describe('AdminMapService', () => {
  let service: AdminMapService;

  const prisma = {
    guardian: { findMany: jest.fn() },
    location: { findMany: jest.fn() },
  };
  const guardianLocation = {
    listAllPresences: jest.fn(),
    getLatestHistoryByGuardianIds: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminMapService,
        { provide: PrismaService, useValue: prisma },
        { provide: GuardianLocationService, useValue: guardianLocation },
      ],
    }).compile();

    service = module.get(AdminMapService);
    jest.clearAllMocks();
  });

  it('listGuardianMarkers merges presence and profile fields', async () => {
    prisma.guardian.findMany.mockResolvedValue([
      {
        id: 'g1',
        guardianCode: 'G-00001',
        status: GuardianStatus.ACTIVE,
        user: { fullName: 'Alice' },
        shiftState: {
          shiftStatus: ShiftStatus.AVAILABLE,
          availableForJobs: true,
        },
      },
    ]);
    guardianLocation.listAllPresences.mockResolvedValue(
      new Map([
        [
          'g1',
          {
            lat: -1.94,
            lng: 30.06,
            available: true,
            updatedAt: '2025-05-29T12:00:00.000Z',
          },
        ],
      ]),
    );
    guardianLocation.getLatestHistoryByGuardianIds.mockResolvedValue(new Map());

    const result = await service.listGuardianMarkers({});

    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({
      guardianId: 'g1',
      fullName: 'Alice',
      connected: true,
      source: 'presence',
      latitude: '-1.94',
    });
  });

  it('listGuardianMarkers filters connectedOnly', async () => {
    prisma.guardian.findMany.mockResolvedValue([
      {
        id: 'g1',
        guardianCode: 'G-00001',
        status: GuardianStatus.ACTIVE,
        user: { fullName: 'Alice' },
        shiftState: null,
      },
      {
        id: 'g2',
        guardianCode: 'G-00002',
        status: GuardianStatus.ACTIVE,
        user: { fullName: 'Bob' },
        shiftState: null,
      },
    ]);
    guardianLocation.listAllPresences.mockResolvedValue(
      new Map([
        [
          'g2',
          {
            lat: -1.95,
            lng: 30.07,
            available: false,
            updatedAt: '2025-05-29T12:00:00.000Z',
          },
        ],
      ]),
    );
    guardianLocation.getLatestHistoryByGuardianIds.mockResolvedValue(new Map());

    const result = await service.listGuardianMarkers({ connectedOnly: true });

    expect(result.items).toHaveLength(1);
    expect(result.items[0].guardianId).toBe('g2');
  });

  it('listSiteMarkers returns org site pins', async () => {
    prisma.location.findMany.mockResolvedValue([
      {
        id: 'loc1',
        organizationId: 'org1',
        name: 'HQ',
        district: 'Gasabo',
        address: 'KG 1',
        coordinatePrecision: 'USER_PINNED',
        isPrimary: true,
        status: 'ACTIVE',
        latitude: { toString: () => '-1.94' },
        longitude: { toString: () => '30.06' },
        organization: {
          legalName: 'Acme Ltd',
          tradingName: 'Acme',
          verificationStatus: 'VERIFIED',
        },
      },
    ]);

    const result = await service.listSiteMarkers({});

    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({
      locationId: 'loc1',
      organizationName: 'Acme Ltd',
      latitude: '-1.94',
      isPrimary: true,
    });
  });
});
