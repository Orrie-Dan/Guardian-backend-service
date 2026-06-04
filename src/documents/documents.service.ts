import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import { AuthUserPayload } from '../auth/interfaces/auth-user.interface';
import { AuditService } from '../common/services/audit.service';
import { PrismaService } from '../prisma/prisma.service';

export const ALLOWED_DOCUMENT_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'application/pdf',
] as const;

export type AllowedDocumentMimeType = (typeof ALLOWED_DOCUMENT_MIME_TYPES)[number];

const ADMIN_VERIFICATION_READ = 'admin:verification:read';

@Injectable()
export class DocumentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly audit: AuditService,
  ) {}

  private getMaxBytes(): number {
    return this.config.get<number>('DOCUMENT_MAX_BYTES', 10_485_760);
  }

  private validateUpload(buffer: Buffer, mimeType: string): void {
    const maxBytes = this.getMaxBytes();
    if (buffer.length > maxBytes) {
      throw new BadRequestException({
        code: 'DOCUMENT_TOO_LARGE',
        message: `Document exceeds maximum size of ${maxBytes} bytes`,
      });
    }
    if (
      !ALLOWED_DOCUMENT_MIME_TYPES.includes(
        mimeType as AllowedDocumentMimeType,
      )
    ) {
      throw new BadRequestException({
        code: 'DOCUMENT_MIME_NOT_ALLOWED',
        message: `MIME type ${mimeType} is not allowed`,
      });
    }
  }

  async upload(
    actor: AuthUserPayload,
    input: { buffer: Buffer; mimeType: string },
  ) {
    this.validateUpload(input.buffer, input.mimeType);

    const documentId = randomUUID();
    const storageKey = `uploads/${actor.sub}/${documentId}`;

    await this.prisma.documentStorage.create({
      data: {
        id: documentId,
        storageKey,
        mimeType: input.mimeType,
        sizeBytes: BigInt(input.buffer.length),
        content: Uint8Array.from(input.buffer),
        uploadedBy: actor.sub,
        encrypted: true,
      },
    });

    await this.audit.log({
      actorUserId: actor.sub,
      action: 'DOCUMENT_UPLOADED',
      entityType: 'system.document_storage',
      entityId: documentId,
    });

    return {
      documentId,
      mimeType: input.mimeType,
      sizeBytes: input.buffer.length,
      storageKey,
    };
  }

  async getMetadata(documentId: string, actor: AuthUserPayload) {
    await this.assertCanAccess(documentId, actor);
    const doc = await this.prisma.documentStorage.findUnique({
      where: { id: documentId },
      select: {
        id: true,
        mimeType: true,
        sizeBytes: true,
        createdAt: true,
      },
    });
    if (!doc) {
      throw new NotFoundException('Document not found');
    }
    return {
      id: doc.id,
      mimeType: doc.mimeType,
      sizeBytes: doc.sizeBytes.toString(),
      createdAt: doc.createdAt,
    };
  }

  async getContent(documentId: string, actor: AuthUserPayload) {
    await this.assertCanAccess(documentId, actor);
    return this.loadDocumentContent(documentId);
  }

  async getVerificationDocumentContent(
    documentId: string,
    actor: AuthUserPayload,
  ) {
    if (!actor.permissions?.includes(ADMIN_VERIFICATION_READ)) {
      throw new ForbiddenException({
        code: 'FORBIDDEN',
        message: 'Missing permission to access verification documents',
      });
    }

    if (!(await this.isLinkedForAdminReview(documentId))) {
      throw new NotFoundException('Document not found');
    }

    return this.loadDocumentContent(documentId);
  }

  private async loadDocumentContent(documentId: string) {
    const doc = await this.prisma.documentStorage.findUnique({
      where: { id: documentId },
      select: { mimeType: true, content: true },
    });
    if (!doc?.content) {
      throw new NotFoundException('Document not found');
    }

    return {
      buffer: Buffer.from(doc.content),
      mimeType: doc.mimeType,
    };
  }

  /** Org KYC or guardian certification evidence linked to this document id. */
  private async isLinkedForAdminReview(documentId: string): Promise<boolean> {
    const [orgLink, certification] = await Promise.all([
      this.prisma.organizationVerificationDocument.findFirst({
        where: { documentId },
        select: { id: true },
      }),
      this.prisma.certification.findFirst({
        where: { documentId },
        select: { id: true },
      }),
    ]);
    return !!(orgLink ?? certification);
  }

  private async assertCanAccess(
    documentId: string,
    actor: AuthUserPayload,
  ): Promise<void> {
    const doc = await this.prisma.documentStorage.findUnique({
      where: { id: documentId },
      select: { uploadedBy: true },
    });
    if (!doc) {
      throw new NotFoundException('Document not found');
    }

    if (doc.uploadedBy === actor.sub) {
      return;
    }

    if (actor.guardianId) {
      const ownCert = await this.prisma.certification.findFirst({
        where: { documentId, guardianId: actor.guardianId },
        select: { id: true },
      });
      if (ownCert) {
        return;
      }
    }

    if (actor.permissions?.includes(ADMIN_VERIFICATION_READ)) {
      if (await this.isLinkedForAdminReview(documentId)) {
        return;
      }
    }

    throw new NotFoundException('Document not found');
  }
}
