import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  Inject,
  Injectable,
  Logger,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { Request, Response } from "express";
import { randomUUID } from "node:crypto";
import { RuleError } from "../domain/engine";
import { ApplicationError, ErrorCode } from "./application-error";
export interface ApiErrorModel {
  statusCode: number;
  code: ErrorCode;
  message: string;
}
export function mapApiError(error: unknown): ApiErrorModel {
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
@Injectable()
@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  constructor(@Inject(Logger) private readonly logger: Logger) {}
  catch(error: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    const request = host.switchToHttp().getRequest<Request>();
    const requestId =
      typeof request.headers["x-request-id"] === "string" &&
      /^[\w-]{1,100}$/.test(request.headers["x-request-id"])
        ? request.headers["x-request-id"]
        : randomUUID();
    const mapped = mapApiError(error);
    response.setHeader("X-Request-ID", requestId);
    if (mapped.statusCode >= 500)
      this.logger.error({
        event: "request_failed",
        requestId,
        code: mapped.code,
        errorType: error instanceof Error ? error.name : "unknown",
      });
    response.status(mapped.statusCode).json(mapped);
  }
}
