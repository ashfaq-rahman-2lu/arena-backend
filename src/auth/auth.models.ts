export type TokenPurpose = "VERIFY" | "RESET";
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
  userId: string | null;
  expires: number;
}
export interface OAuthStart {
  url: string;
  state: OAuthState;
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
