import Ajv from "ajv";
import { readFileSync } from "node:fs";
import { Response } from "supertest";
const contract: unknown = JSON.parse(readFileSync("openapi.json", "utf8"));
const validator = new Ajv({ strict: false, validateFormats: false });
if (!contract || typeof contract !== "object" || !("components" in contract))
  throw new Error("Missing generated contract");
validator.addSchema({ $id: "arena", components: contract.components });
export function readResponse<T>(response: Response, schema: string): T {
  const validate = validator.compile<T>({
    $ref: `arena#/components/schemas/${schema}`,
  });
  if (!validate) throw new Error(`Unknown schema ${schema}`);
  const value: unknown = JSON.parse(response.text);
  if (!validate(value))
    throw new Error(
      `Response failed ${schema}: ${validator.errorsText(validate.errors)}`,
    );
  return value;
}
