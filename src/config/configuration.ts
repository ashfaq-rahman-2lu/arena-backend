import { z } from "zod";
export interface SmtpConfiguration {
  host: string;
  port: number;
  secure: boolean;
  user: string | null;
  password: string | null;
  from: string;
}
export interface GoogleConfiguration {
  clientId: string;
  clientSecret: string;
  callbackUrl: string;
}
export interface VisionConfiguration {
  python: string;
}
export interface ApplicationConfiguration {
  databaseUrl: string;
  environment: "development" | "test" | "production";
  frontendUrl: string;
  sessionSecret: string;
  port: number;
  host: string;
  cookieSecure: boolean;
  trustProxy: boolean;
  authRateLimit: number;
  extractionRateLimit: number;
  smtp: SmtpConfiguration | null;
  google: GoogleConfiguration | null;
  vision: VisionConfiguration;
}
const bool = z
  .enum(["true", "false"])
  .default("false")
  .transform((value: "true" | "false"): boolean => value === "true");
const positive = z.coerce.number().int().min(1).max(2147483647);
const schema = z.object({
  DATABASE_URL: z
    .url()
    .refine(
      (value: string): boolean =>
        ["postgres:", "postgresql:"].includes(new URL(value).protocol),
      "Expected PostgreSQL URL",
    ),
  FRONTEND_URL: z
    .url()
    .refine(
      (value: string): boolean =>
        ["http:", "https:"].includes(new URL(value).protocol) &&
        new URL(value).origin === value,
      "Expected exact HTTP origin",
    ),
  SESSION_SECRET: z.string().min(32),
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  PORT: positive.max(65535).default(3000),
  HOST: z.string().min(1).default("127.0.0.1"),
  COOKIE_SECURE: bool,
  TRUST_PROXY: bool,
  AUTH_RATE_LIMIT: positive.default(20),
  EXTRACTION_RATE_LIMIT: positive.default(5),
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: positive.max(65535).default(1025),
  SMTP_SECURE: bool,
  SMTP_USER: z.string().optional(),
  SMTP_PASSWORD: z.string().optional(),
  MAIL_FROM: z.string().min(1).default("Arena <noreply@arena.local>"),
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  GOOGLE_CALLBACK_URL: z.string().optional(),
  PADDLEOCR_PYTHON: z.string().min(1).default("python3"),
});
export function validateConfiguration(
  env: Record<string, unknown>,
): ApplicationConfiguration {
  const parsed = schema.safeParse(env);
  if (!parsed.success)
    throw new Error(
      `Invalid configuration: ${parsed.error.issues.map((issue: z.core.$ZodIssue): string => issue.path.join(".")).join(", ")}`,
    );
  const value = parsed.data;
  if (
    value.NODE_ENV === "production" &&
    (!value.COOKIE_SECURE || !value.FRONTEND_URL.startsWith("https://"))
  )
    throw new Error("Production requires secure cookies and HTTPS");
  if (
    Boolean(value.SMTP_USER) !== Boolean(value.SMTP_PASSWORD) ||
    (!value.SMTP_HOST && (value.SMTP_USER || value.SMTP_PASSWORD))
  )
    throw new Error("Incomplete SMTP credentials");
  if (
    (value.GOOGLE_CLIENT_ID || value.GOOGLE_CLIENT_SECRET) &&
    (!value.GOOGLE_CLIENT_ID ||
      !value.GOOGLE_CLIENT_SECRET ||
      !value.GOOGLE_CALLBACK_URL ||
      !z.url().safeParse(value.GOOGLE_CALLBACK_URL).success)
  )
    throw new Error("Incomplete Google credentials");
  return {
    databaseUrl: value.DATABASE_URL,
    frontendUrl: value.FRONTEND_URL,
    sessionSecret: value.SESSION_SECRET,
    environment: value.NODE_ENV,
    port: value.PORT,
    host: value.HOST,
    cookieSecure: value.COOKIE_SECURE,
    trustProxy: value.TRUST_PROXY,
    authRateLimit: value.AUTH_RATE_LIMIT,
    extractionRateLimit: value.EXTRACTION_RATE_LIMIT,
    smtp: value.SMTP_HOST
      ? {
          host: value.SMTP_HOST,
          port: value.SMTP_PORT,
          secure: value.SMTP_SECURE,
          user: value.SMTP_USER || null,
          password: value.SMTP_PASSWORD || null,
          from: value.MAIL_FROM,
        }
      : null,
    google:
      value.GOOGLE_CLIENT_ID &&
      value.GOOGLE_CLIENT_SECRET &&
      value.GOOGLE_CALLBACK_URL
        ? {
            clientId: value.GOOGLE_CLIENT_ID,
            clientSecret: value.GOOGLE_CLIENT_SECRET,
            callbackUrl: value.GOOGLE_CALLBACK_URL,
          }
        : null,
    vision: { python: value.PADDLEOCR_PYTHON },
  };
}
export const offlineEnvironment: Record<string, string> = {
  DATABASE_URL: "postgresql://offline:offline@127.0.0.1/arena_test",
  FRONTEND_URL: "http://localhost:5173",
  SESSION_SECRET: "offline-generation-only-secret-at-least-thirty-two",
  NODE_ENV: "test",
};
