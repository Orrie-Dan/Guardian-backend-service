import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import { AuthUserPayload } from '../auth/interfaces/auth-user.interface';
import { AuditService } from '../common/services/audit.service';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class DocumentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly audit: AuditService,
  ) {}

  async presign(
    actor: AuthUserPayload,
    input: { mimeType: string; sizeBytes: number },
  ) {
    const documentId = randomUUID();
    const storageKey = `uploads/${actor.sub}/${documentId}`;
    const bucket = this.config.get('S3_BUCKET', 'g2sentry-docs');
    const region = this.config.get('S3_REGION', 'af-south-1');
    const uploadUrl = `https://${bucket}.s3.${region}.amazonaws.com/${storageKey}?presigned=1`;

    await this.prisma.documentStorage.create({
      data: {
        id: documentId,
        storageKey,
        mimeType: input.mimeType,
        sizeBytes: BigInt(input.sizeBytes),
        uploadedBy: actor.sub,
        encrypted: true,
      },
    });

    return { documentId, uploadUrl, storageKey, expiresIn: 900 };
  }

  async confirm(documentId: string, actor: AuthUserPayload) {
    const doc = await this.prisma.documentStorage.findUnique({
      where: { id: documentId },
    });
    if (!doc || doc.uploadedBy !== actor.sub) {
      throw new NotFoundException('Document not found');
    }
    await this.audit.log({
      actorUserId: actor.sub,
      action: 'DOCUMENT_CONFIRMED',
      entityType: 'system.document_storage',
      entityId: documentId,
    });
    return { documentId, status: 'confirmed' };
  }

  async get(documentId: string, actor: AuthUserPayload) {
    const doc = await this.prisma.documentStorage.findUnique({
      where: { id: documentId },
    });
    if (!doc) {
      throw new NotFoundException('Document not found');
    }
    if (doc.uploadedBy && doc.uploadedBy !== actor.sub) {
      throw new NotFoundException('Document not found');
    }
    const bucket = this.config.get('S3_BUCKET', 'g2sentry-docs');
    const region = this.config.get('S3_REGION', 'af-south-1');
    const downloadUrl = `https://${bucket}.s3.${region}.amazonaws.com/${doc.storageKey}`;
    return {
      id: doc.id,
      mimeType: doc.mimeType,
      sizeBytes: doc.sizeBytes.toString(),
      downloadUrl,
      createdAt: doc.createdAt,
    };
  }
}
