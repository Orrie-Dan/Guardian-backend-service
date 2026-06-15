/** Stable payload.action values for client deep-linking. */
export const InAppNotificationAction = {
  COMPLETE_SITE_SETUP: 'COMPLETE_SITE_SETUP',
  VIEW_REJECTION: 'VIEW_REJECTION',
  REVIEW_REPLACEMENT: 'REVIEW_REPLACEMENT',
  VIEW_OFFER: 'VIEW_OFFER',
  VIEW_ASSIGNMENTS: 'VIEW_ASSIGNMENTS',
  VIEW_JOB: 'VIEW_JOB',
  REVIEW_EARLY_RELEASE: 'REVIEW_EARLY_RELEASE',
  VIEW_INVOICE: 'VIEW_INVOICE',
  REVIEW_INVOICE: 'REVIEW_INVOICE',
  VIEW_APPLICATION: 'VIEW_APPLICATION',
  VIEW_EARNINGS: 'VIEW_EARNINGS',
} as const;

export type InAppNotificationAction =
  (typeof InAppNotificationAction)[keyof typeof InAppNotificationAction];
