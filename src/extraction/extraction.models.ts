import { z } from "zod";
import { Entrant } from "../domain/engine";
const observed = z.object({
  name: z.string().nullable(),
  score: z.number().int().nonnegative().max(2147483647).nullable(),
  tiebreak: z.number().int().nonnegative().max(2147483647).nullable(),
});
export const extracted = z.object({
  sides: z.array(observed).length(2),
  warnings: z.array(z.string().max(500)).max(20),
});
export type Extracted = z.infer<typeof extracted>;
export abstract class VisionProvider {
  abstract read(image: Buffer, entrants: Entrant[]): Promise<Extracted>;
}
