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

export function decimalToString(
  value: Prisma.Decimal | null | undefined,
): string | null {
  if (value == null) {
    return null;
  }
  return value.toString();
}

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

export function mapLocation<
  T extends { latitude: Prisma.Decimal; longitude: Prisma.Decimal },
>(location: T) {
  return {
    ...location,
    latitude: location.latitude.toString(),
    longitude: location.longitude.toString(),
  };
}

export function mapGuardianForAdmin<
  T extends {
    rating: Prisma.Decimal;
    reliabilityScore: Prisma.Decimal;
    avgResponseMinutes: Prisma.Decimal | null;
  },
>(guardian: T) {
  return {
    ...guardian,
    rating: guardian.rating.toString(),
    reliabilityScore: guardian.reliabilityScore.toString(),
    avgResponseMinutes: decimalToString(guardian.avgResponseMinutes),
  };
}
