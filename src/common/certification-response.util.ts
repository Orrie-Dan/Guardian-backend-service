import { Prisma } from '@prisma/client';
import {
  DOCUMENT_METADATA_SELECT,
  DocumentMetadataRow,
  mapDocumentMetadata,
} from './document-metadata.util';

export const CERTIFICATION_WITH_DOCUMENT_INCLUDE = {
  document: { select: DOCUMENT_METADATA_SELECT },
} as const satisfies Prisma.CertificationInclude;

export function mapCertificationForResponse<
  T extends { document?: DocumentMetadataRow | null },
>(cert: T) {
  const { document, ...rest } = cert;
  return {
    ...rest,
    document: document ? mapDocumentMetadata(document) : null,
  };
}
