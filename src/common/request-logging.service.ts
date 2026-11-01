import { Inject, Injectable, Logger, NestMiddleware } from "@nestjs/common";
import { NextFunction, Request, Response } from "express";
import { randomUUID } from "node:crypto";
import { HttpRequestLog, RequestContext } from "./request-context.models";
import { RequestContextService } from "./request-context.service";

function requestId(request: Request): string {
  const supplied: unknown = request.headers["x-request-id"];
  let count = 0;
  for (let index = 0; index < request.rawHeaders.length; index += 2) {
    if (request.rawHeaders[index]?.toLowerCase() === "x-request-id") count++;
  }
  return count === 1 &&
    typeof supplied === "string" &&
    /^[\w-]{1,100}$/.test(supplied)
    ? supplied
    : randomUUID();
}

function routeTemplate(request: Request): string {
  const route: unknown = request.route;
  if (!route || typeof route !== "object" || !("path" in route))
    return "unmatched";
  return typeof route.path === "string" ? route.path : "unmatched";
}

@Injectable()
export class RequestLoggingService implements NestMiddleware {
  constructor(
    private readonly context: RequestContextService,
    @Inject(Logger) private readonly logger: Logger,
  ) {}

  use(request: Request, response: Response, next: NextFunction): void {
    const state: RequestContext = {
      requestId: requestId(request),
      userId: null,
      errorCode: null,
      errorType: null,
    };
    const started = performance.now();
    const timestamp = new Date().toISOString();
    const userAgent =
      request
        .get("user-agent")
        ?.replace(/[\u0000-\u001f\u007f]/g, " ")
        .slice(0, 512) ?? null;
    response.setHeader("X-Request-ID", state.requestId);
    let recorded = false;
    const complete = (): void => {
      if (recorded) return;
      recorded = true;
      response.removeListener("finish", complete);
      response.removeListener("close", complete);
      const outcome = response.writableFinished ? "completed" : "aborted";
      const entry: HttpRequestLog = {
        ...state,
        event: "http_request",
        timestamp,
        method: request.method,
        route: routeTemplate(request),
        statusCode: response.headersSent ? response.statusCode : null,
        durationMs: performance.now() - started,
        outcome,
        clientIp: request.ip ?? null,
        userAgent,
      };
      this.context.run(state, (): void => {
        if (entry.statusCode !== null && entry.statusCode >= 500)
          this.logger.error(entry);
        else if (
          outcome === "aborted" ||
          (entry.statusCode !== null && entry.statusCode >= 400)
        )
          this.logger.warn(entry);
        else this.logger.log(entry);
      });
    };
    response.once("finish", complete);
    response.once("close", complete);
    this.context.run(state, next);
  }
}
