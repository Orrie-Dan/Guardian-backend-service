import { Prisma } from '@prisma/client';

/** Document fields safe for JSON list/detail responses (excludes `content`). */
export const DOCUMENT_METADATA_SELECT = {
  id: true,
  mimeType: true,
  storageKey: true,
  sizeBytes: true,
  encrypted: true,
  uploadedBy: true,
  createdAt: true,
} as const satisfies Prisma.DocumentStorageSelect;

export type DocumentMetadataRow = Prisma.DocumentStorageGetPayload<{
  select: typeof DOCUMENT_METADATA_SELECT;
}>;

export function mapDocumentMetadata(doc: DocumentMetadataRow) {
  return {
    id: doc.id,
    mimeType: doc.mimeType,
    storageKey: doc.storageKey,
    sizeBytes: doc.sizeBytes.toString(),
    encrypted: doc.encrypted,
    uploadedBy: doc.uploadedBy,
    createdAt: doc.createdAt,
  };
}
