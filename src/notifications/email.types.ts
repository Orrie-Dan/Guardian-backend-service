export interface SendMailPayload {
  to: string;
  subject: string;
  text: string;
  html?: string;
}
