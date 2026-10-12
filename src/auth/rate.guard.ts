import { CanActivate, ExecutionContext, Injectable } from "@nestjs/common";
import { ApplicationError } from "../common/application-error";
import { ConfigurationService } from "../config/configuration.service";
import { AuthedRequest } from "./http-session";
interface RateBucket {
  count: number;
  expires: number;
}
@Injectable()
export class RateGuard implements CanActivate {
  private readonly buckets: Map<string, RateBucket> = new Map();
  constructor(private readonly config: ConfigurationService) {}
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<AuthedRequest>();
    const extraction = request.path.endsWith("/extract-score"),
      auth = request.path.includes("/auth/") && request.method === "POST";
    if (!extraction && !auth) return true;
    const now = Date.now(),
      key = extraction ? `vision:${request.userId}` : `auth:${request.ip}`;
    for (const [id, bucket] of this.buckets)
      if (bucket.expires < now) this.buckets.delete(id);
    const bucket = this.buckets.get(key) ?? { count: 0, expires: now + 60000 };
    bucket.count++;
    this.buckets.set(key, bucket);
    if (
      bucket.count >
      (extraction
        ? this.config.values.extractionRateLimit
        : this.config.values.authRateLimit)
    )
      throw new ApplicationError(
        "RATE_LIMITED",
        429,
        "Too many requests. Try again in a minute.",
      );
    return true;
  }
}
