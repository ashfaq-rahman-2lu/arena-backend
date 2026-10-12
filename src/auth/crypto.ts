import { createHash, timingSafeEqual } from "node:crypto";
export function hash(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}
export function equal(a: string, b: string): boolean {
  const left = Buffer.from(a),
    right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}
