import { INestApplication } from "@nestjs/common";
import { DocumentBuilder, OpenAPIObject, SwaggerModule } from "@nestjs/swagger";
import { ApiError } from "./common/api-error.dto";
export function documentation(app: INestApplication): OpenAPIObject {
  return SwaggerModule.createDocument(
    app,
    new DocumentBuilder()
      .setTitle("Arena API")
      .setDescription(
        "Get /auth/session first. Send its csrf as X-CSRF-Token on mutations. Signed cookie sessions; one API instance. Collections use page/limit (1/20; max 100).",
      )
      .setVersion("1.0")
      .addCookieAuth("arena_session")
      .addApiKey({ type: "apiKey", in: "header", name: "X-CSRF-Token" }, "csrf")
      .addGlobalResponse({
        status: 400,
        description: "Validation or competition rule failure",
        type: ApiError,
      })
      .addGlobalResponse({
        status: 401,
        description: "Authentication required",
        type: ApiError,
      })
      .addGlobalResponse({
        status: 403,
        description: "Ownership or CSRF denied",
        type: ApiError,
      })
      .addGlobalResponse({
        status: 404,
        description: "Resource not found",
        type: ApiError,
      })
      .addGlobalResponse({
        status: 409,
        description: "Revision conflict or reset confirmation required",
        type: ApiError,
      })
      .addGlobalResponse({
        status: 429,
        description: "Rate limit exceeded",
        type: ApiError,
      })
      .addGlobalResponse({
        status: 500,
        description: "Unexpected error",
        type: ApiError,
      })
      .addGlobalResponse({
        status: 503,
        description: "Integration unavailable",
        type: ApiError,
      })
      .build(),
  );
}
