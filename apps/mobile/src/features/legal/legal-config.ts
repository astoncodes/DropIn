import { env } from '../../lib/env';

/**
 * The owner-specific facts the privacy policy, terms and support pages state.
 *
 * Contact details come from configuration so they are set once per deployment;
 * the rest are policy decisions recorded here, next to the documents that
 * promise them to players. Changing one of these changes a legal commitment.
 */
export const LEGAL = {
  /** Shown as the documents' revision date. Update whenever their text changes. */
  lastUpdated: 'September 26, 2026',
  operatorName: env.operatorName || 'the Drop In team',
  supportEmail: env.supportEmail || null,
  siteUrl: env.siteUrl || null,
  /** Youngest age allowed to hold an account. */
  minimumAge: 16,
  /** Where the hosted database and file storage run (Supabase, us-east-1). */
  dataRegion: 'the United States',
  governingLaw:
    'the laws of the Province of Prince Edward Island and the federal laws of Canada that apply there',
  /** How quickly moderators aim to review a report. */
  reportReviewTarget: 'within 24 hours',
  supportReplyTarget: 'within two business days',
} as const;

/** Where people can read about and request account deletion on the web. */
export function deletionPageAddress(): string {
  return LEGAL.siteUrl ? `${LEGAL.siteUrl}/delete-account` : 'the Delete account page';
}

/** "email support@example.com", or an honest fallback before one is configured. */
export function contactPhrase(): string {
  return LEGAL.supportEmail
    ? `email ${LEGAL.supportEmail}`
    : 'use the contact address on our support page';
}
