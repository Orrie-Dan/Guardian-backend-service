import { OrgType, OrgVerificationDocumentType } from '@prisma/client';

const INDIVIDUAL_ALLOWED: OrgVerificationDocumentType[] = [
  OrgVerificationDocumentType.NATIONAL_ID,
  OrgVerificationDocumentType.TIN_CERTIFICATE,
];

const BUSINESS_ALLOWED: OrgVerificationDocumentType[] = [
  OrgVerificationDocumentType.TIN_CERTIFICATE,
  OrgVerificationDocumentType.BUSINESS_REGISTRATION,
];

export function getRequiredDocumentOptions(
  orgType: OrgType,
): OrgVerificationDocumentType[] {
  if (orgType === OrgType.INDIVIDUAL) {
    return [...INDIVIDUAL_ALLOWED];
  }
  return [...BUSINESS_ALLOWED];
}

export function isDocumentTypeAllowedForOrg(
  orgType: OrgType,
  documentType: OrgVerificationDocumentType,
): boolean {
  if (documentType === OrgVerificationDocumentType.OTHER) {
    return true;
  }
  return getRequiredDocumentOptions(orgType).includes(documentType);
}

export function hasSatisfyingVerificationDocument(
  orgType: OrgType,
  documentTypes: OrgVerificationDocumentType[],
): boolean {
  const satisfying = documentTypes.filter(
    (t) => t !== OrgVerificationDocumentType.OTHER,
  );
  if (orgType === OrgType.INDIVIDUAL) {
    return satisfying.some((t) => INDIVIDUAL_ALLOWED.includes(t));
  }
  return satisfying.some((t) => BUSINESS_ALLOWED.includes(t));
}
