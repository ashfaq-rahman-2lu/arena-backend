import { ErrorCode } from "./application-error";

export interface RequestCorrelation {
  requestId: string;
  userId: string | null;
}

export type RequestErrorType =
  | "ApplicationError"
  | "HttpException"
  | "PrismaError"
  | "SyntaxError"
  | "Error"
  | "unknown";

export interface RequestContext extends RequestCorrelation {
  errorCode: ErrorCode | null;
  errorType: RequestErrorType | null;
}

export interface HttpRequestLog extends RequestContext {
  event: "http_request";
  timestamp: string;
  method: string;
  route: string;
  statusCode: number | null;
  durationMs: number;
  outcome: "completed" | "aborted";
  clientIp: string | null;
  userAgent: string | null;
}
