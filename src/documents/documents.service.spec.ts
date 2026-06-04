import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { AuditService } from '../common/services/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { DocumentsService } from './documents.service';

describe('DocumentsService', () => {
  let service: DocumentsService;

  const prisma = {
    documentStorage: {
      create: jest.fn(),
      findUnique: jest.fn(),
    },
    organizationVerificationDocument: {
      findFirst: jest.fn(),
    },
    certification: {
      findFirst: jest.fn(),
    },
  };
  const audit = { log: jest.fn() };
  const config = {
    get: jest.fn((key: string, defaultValue?: number) => {
      if (key === 'DOCUMENT_MAX_BYTES') return 1024;
      return defaultValue;
    }),
  };

  const actor = {
    sub: 'user-1',
    phone: '+250788123456',
    roles: [],
    activeRole: 'CLIENT_OWNER' as const,
    organizationIds: [],
    permissions: [],
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DocumentsService,
        { provide: PrismaService, useValue: prisma },
        { provide: ConfigService, useValue: config },
        { provide: AuditService, useValue: audit },
      ],
    }).compile();

    service = module.get(DocumentsService);
  });

  it('upload rejects oversize files', async () => {
    const buffer = Buffer.alloc(2048);
    await expect(
      service.upload(actor, { buffer, mimeType: 'image/jpeg' }),
    ).rejects.toThrow(BadRequestException);
  });

  it('upload rejects disallowed MIME types', async () => {
    const buffer = Buffer.alloc(100);
    await expect(
      service.upload(actor, { buffer, mimeType: 'text/plain' }),
    ).rejects.toMatchObject({
      response: { code: 'DOCUMENT_MIME_NOT_ALLOWED' },
    });
  });

  it('upload creates document row with content', async () => {
    const buffer = Buffer.alloc(100);
    prisma.documentStorage.create.mockResolvedValue({ id: 'doc-1' });

    const result = await service.upload(actor, {
      buffer,
      mimeType: 'image/jpeg',
    });

    expect(result.sizeBytes).toBe(100);
    expect(prisma.documentStorage.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          content: buffer,
          mimeType: 'image/jpeg',
          uploadedBy: 'user-1',
        }),
      }),
    );
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'DOCUMENT_UPLOADED' }),
    );
  });

  it('getContent returns 404 for non-owner without admin link', async () => {
    prisma.documentStorage.findUnique.mockResolvedValue({
      uploadedBy: 'other-user',
    });
    prisma.organizationVerificationDocument.findFirst.mockResolvedValue(null);
    prisma.certification.findFirst.mockResolvedValue(null);

    await expect(service.getContent('doc-1', actor)).rejects.toThrow(
      NotFoundException,
    );
  });

  it('getVerificationDocumentContent allows certification-linked documents', async () => {
    const adminActor = {
      ...actor,
      permissions: ['admin:verification:read'],
    };
    const pdf = Buffer.from('%PDF-1.4');
    prisma.organizationVerificationDocument.findFirst.mockResolvedValue(null);
    prisma.certification.findFirst.mockResolvedValue({ id: 'cert-1' });
    prisma.documentStorage.findUnique.mockResolvedValue({
      mimeType: 'application/pdf',
      content: Uint8Array.from(pdf),
    });

    const result = await service.getVerificationDocumentContent(
      'doc-1',
      adminActor,
    );

    expect(result.buffer.equals(pdf)).toBe(true);
    expect(result.mimeType).toBe('application/pdf');
  });

  it('getContent allows admin with verification read on certification-linked doc', async () => {
    const adminActor = {
      ...actor,
      sub: 'admin-2',
      permissions: ['admin:verification:read'],
    };
    const pdf = Buffer.from('%PDF-1.4');
    prisma.documentStorage.findUnique
      .mockResolvedValueOnce({ uploadedBy: 'admin-1' })
      .mockResolvedValueOnce({
        mimeType: 'application/pdf',
        content: Uint8Array.from(pdf),
      });
    prisma.organizationVerificationDocument.findFirst.mockResolvedValue(null);
    prisma.certification.findFirst.mockResolvedValue({ id: 'cert-1' });

    const result = await service.getContent('doc-1', adminActor);

    expect(result.buffer.equals(pdf)).toBe(true);
  });

  it('getContent allows guardian to read their certification document', async () => {
    const guardianActor = {
      ...actor,
      sub: 'guardian-user',
      guardianId: 'guardian-1',
      permissions: ['documents:read'],
    };
    const pdf = Buffer.from('%PDF-1.4');
    prisma.documentStorage.findUnique
      .mockResolvedValueOnce({ uploadedBy: 'admin-1' })
      .mockResolvedValueOnce({
        mimeType: 'application/pdf',
        content: Uint8Array.from(pdf),
      });
    prisma.certification.findFirst.mockResolvedValue({ id: 'cert-1' });

    const result = await service.getContent('doc-1', guardianActor);

    expect(result.buffer.equals(pdf)).toBe(true);
  });
});
