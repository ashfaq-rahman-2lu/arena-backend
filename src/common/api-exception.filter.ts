import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  Injectable,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { Response } from "express";
import { RuleError } from "../domain/engine";
import { ApplicationError, ErrorCode } from "./application-error";
import { RequestContextService } from "./request-context.service";
import { RequestErrorType } from "./request-context.models";
export interface ApiErrorModel {
  statusCode: number;
  code: ErrorCode;
  message: string;
}
export function mapApiError(error: unknown): ApiErrorModel {
  if (
    error instanceof Error &&
    "type" in error &&
    error.type === "entity.too.large" &&
    "status" in error &&
    error.status === 413
  )
    return {
      statusCode: 413,
      code: "VALIDATION_FAILED",
      message: "Request body too large",
    };
  if (error instanceof ApplicationError)
    return {
      statusCode: error.statusCode,
      code: error.code,
      message: error.message,
    };
  if (error instanceof RuleError)
    return { statusCode: 400, code: "RULE_VIOLATION", message: error.message };
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === "P2025")
      return {
        statusCode: 404,
        code: "NOT_FOUND",
        message: "Record not found",
      };
    if (["P2002", "P2034"].includes(error.code))
      return {
        statusCode: 409,
        code: error.code === "P2002" ? "ALREADY_EXISTS" : "REVISION_CONFLICT",
        message: "This record changed or already exists. Refresh and retry.",
      };
  }
  if (error instanceof HttpException) {
    const status = error.getStatus();
    const code: ErrorCode =
      status === 400
        ? "VALIDATION_FAILED"
        : status === 401
          ? "UNAUTHENTICATED"
          : status === 403
            ? "FORBIDDEN"
            : status === 404
              ? "NOT_FOUND"
              : status === 409
                ? "REVISION_CONFLICT"
                : status === 429
                  ? "RATE_LIMITED"
                  : status === 503
                    ? "INTEGRATION_UNAVAILABLE"
                    : "INTERNAL_ERROR";
    return {
      statusCode: status,
      code,
      message:
        status >= 500 ? "Service unavailable. Please retry." : error.message,
    };
  }
  return {
    statusCode: 500,
    code: "INTERNAL_ERROR",
    message: "Something went wrong. Please retry.",
  };
}
function errorType(error: unknown): RequestErrorType {
  if (error instanceof ApplicationError) return "ApplicationError";
  if (error instanceof HttpException) return "HttpException";
  if (error instanceof Prisma.PrismaClientKnownRequestError)
    return "PrismaError";
  if (error instanceof SyntaxError) return "SyntaxError";
  return error instanceof Error ? "Error" : "unknown";
}
@Injectable()
@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  constructor(private readonly context: RequestContextService) {}
  catch(error: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    const mapped = mapApiError(error);
    const context = this.context.current();
    if (context) {
      context.errorCode = mapped.code;
      context.errorType = errorType(error);
    }
    response.status(mapped.statusCode).json(mapped);
  }
}
