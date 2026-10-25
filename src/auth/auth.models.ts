export type TokenPurpose = "VERIFY" | "RESET" | "EMAIL_CHANGE";
export interface Account {
  id: string;
  name: string;
  email: string;
  passwordHash: string | null;
  verified: boolean;
}
export interface SessionRecord {
  id: string;
  userId: string;
  csrf: string;
  user: Account;
}
export interface SessionCredentials {
  token: string;
  csrf: string;
}
export interface MessageResult {
  message: string;
}
export type EmailChangeDecision =
  | { status: "verification_sent"; message: string }
  | { status: "google_confirmation_required" };
export type EmailChangeResult =
  | { status: "verification_sent"; message: string }
  | { status: "google_confirmation_required"; authorizationUrl: string };
export interface UserView {
  id: string;
  name: string;
  email: string;
  hasPassword: boolean;
  googleLinked: boolean;
}
export interface SessionView {
  csrf: string;
  user: UserView | null;
  googleEnabled: boolean;
}
export interface OAuthState {
  state: string;
}
export type OAuthAttemptAction = "LOGIN" | "LINK" | "EMAIL_CHANGE";
export interface OAuthAttemptRecord {
  action: OAuthAttemptAction;
  userId: string | null;
  sessionId: string | null;
  proposedEmail: string | null;
  returnTo: string;
  expiresAt: Date;
}
export interface OAuthCompletion {
  action: OAuthAttemptAction;
  userId: string | null;
  emailChange: string | null;
  linked: boolean;
  returnTo: string;
  cancelled: boolean;
  failed: boolean;
}
export interface OAuthStart {
  url: string;
  state: string;
}
export interface GoogleIdentity {
  subject: string;
  email: string;
  name: string;
}
export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
}
