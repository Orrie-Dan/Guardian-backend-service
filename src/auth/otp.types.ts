/** Context for OTP email copy (SMS message is unchanged). */
export type OtpPurpose =
  | 'sign_in'
  | 'password_reset'
  | 'guardian_activation'
  | 'general';

export type OtpRequestOptions = {
  purpose?: OtpPurpose;
};
