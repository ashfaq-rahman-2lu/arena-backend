import { SetMetadata } from "@nestjs/common";
import { CookieOptions, Request, Response } from "express";
import { ApplicationError } from "../common/application-error";
import { ConfigurationService } from "../config/configuration.service";
import { SessionCredentials } from "./auth.models";
export const Public = (): MethodDecorator & ClassDecorator =>
  SetMetadata("public", true);
export type AuthedRequest = Request & {
  userId?: string;
  sessionId?: string;
  csrf?: string;
};
export function cookie(request: Request, name: string): string | null {
  const cookies: unknown = request.signedCookies;
  if (typeof cookies !== "object" || cookies === null || !(name in cookies))
    return null;
  const value: unknown = Reflect.get(cookies, name);
  return typeof value === "string" ? value : null;
}
export function cookieOptions(config: ConfigurationService): CookieOptions {
  return {
    httpOnly: true,
    secure: config.values.cookieSecure,
    sameSite: "lax",
    path: "/",
    signed: true,
  };
}
export function setCredentials(
  response: Response,
  credentials: SessionCredentials,
  config: ConfigurationService,
): void {
  response.cookie("arena_session", credentials.token, {
    ...cookieOptions(config),
    maxAge: 7 * 86400000,
  });
  response.cookie("arena_csrf", credentials.csrf, {
    ...cookieOptions(config),
    maxAge: 7 * 86400000,
  });
}
export function actor(request: AuthedRequest): string {
  if (!request.userId)
    throw new ApplicationError("UNAUTHENTICATED", 401, "Sign in to continue");
  return request.userId;
}
