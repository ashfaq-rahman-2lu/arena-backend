export type ErrorCode =
  | "VALIDATION_FAILED"
  | "RULE_VIOLATION"
  | "UNAUTHENTICATED"
  | "EMAIL_VERIFICATION_REQUIRED"
  | "FORBIDDEN"
  | "CSRF_INVALID"
  | "NOT_FOUND"
  | "REVISION_CONFLICT"
  | "RESET_CONFIRMATION_REQUIRED"
  | "ALREADY_EXISTS"
  | "RATE_LIMITED"
  | "INTEGRATION_UNAVAILABLE"
  | "INVALID_TOKEN"
  | "OAUTH_INVALID"
  | "INTERNAL_ERROR";
export class ApplicationError extends Error {
  constructor(
    readonly code: ErrorCode,
    readonly statusCode: number,
    message: string,
  ) {
    super(message);
  }
}
