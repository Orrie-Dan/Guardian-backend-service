import { Prisma } from '@prisma/client';

export {
  DOCUMENT_METADATA_SELECT,
  DocumentMetadataRow,
  mapDocumentMetadata,
} from '../common/document-metadata.util';

export function decimalToString(
  value: Prisma.Decimal | null | undefined,
): string | null {
  if (value == null) {
    return null;
  }
  return value.toString();
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
