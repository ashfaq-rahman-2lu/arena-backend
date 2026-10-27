import "reflect-metadata";
import { Type, ValidationPipe } from "@nestjs/common";
import {
  ReferenceObject,
  SchemaObject,
} from "@nestjs/swagger/dist/interfaces/open-api-spec.interface";
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  EmailChangeInput,
  LoginInput,
  PasswordChangeInput,
  RegistrationInput,
  ResetInput,
} from "../src/auth/auth-request.dto";
import { createApp } from "../src/app";
import { offlineEnvironment } from "../src/config/configuration";
import { documentation } from "../src/swagger";

interface PasswordCase {
  metatype: Type<object>;
  body: Record<string, unknown>;
  fields: string[];
}

const cases: PasswordCase[] = [
  {
    metatype: LoginInput,
    body: { email: "user@example.test", password: "abcdefgh" },
    fields: ["password"],
  },
  {
    metatype: RegistrationInput,
    body: { email: "user@example.test", name: "User", password: "abcdefgh" },
    fields: ["password"],
  },
  {
    metatype: ResetInput,
    body: { token: "a".repeat(64), password: "abcdefgh" },
    fields: ["password"],
  },
  {
    metatype: PasswordChangeInput,
    body: { currentPassword: "abcdefgh", password: "ijklmnop" },
    fields: ["currentPassword", "password"],
  },
  {
    metatype: EmailChangeInput,
    body: { email: "new@example.test", currentPassword: "abcdefgh" },
    fields: ["currentPassword"],
  },
];

async function validate(
  input: PasswordCase,
  body: Record<string, unknown>,
): Promise<unknown> {
  const pipe = new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  });
  return pipe.transform(body, { type: "body", metatype: input.metatype });
}

for (const input of cases) {
  test(`${input.metatype.name} accepts passwords from 8 through 128 characters`, async (): Promise<void> => {
    await validate(input, input.body);
    for (const field of input.fields) {
      await validate(input, { ...input.body, [field]: "a".repeat(9) });
      await validate(input, { ...input.body, [field]: "a".repeat(128) });
    }
  });

  test(`${input.metatype.name} rejects passwords outside 8–128 characters and non-string values`, async (): Promise<void> => {
    for (const field of input.fields) {
      for (const value of ["", "a".repeat(7), "a".repeat(129), 12345678]) {
        await assert.rejects(
          validate(input, { ...input.body, [field]: value }),
          /Bad Request/,
        );
      }
    }
  });
}

test("OpenAPI documents the 8–128 character bounds for every password field", async (): Promise<void> => {
  const app = await createApp({ environment: offlineEnvironment });
  try {
    const schemas = documentation(app).components?.schemas;
    for (const input of cases) {
      const schema = schemas?.[input.metatype.name];
      assert.ok(schema && "properties" in schema);
      for (const field of input.fields) {
        const property: SchemaObject | ReferenceObject | undefined =
          schema.properties?.[field];
        assert.ok(property && "minLength" in property);
        assert.equal(property.minLength, 8);
        assert.equal(property.maxLength, 128);
      }
    }
  } finally {
    await app.close();
  }
});
