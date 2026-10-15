import { createHash } from "node:crypto";
import type { SeedData } from "./generate";

/** SHA-256 of the seed's canonical JSON (key order is fixed by the generator). */
export function seedHash(seed: SeedData): string {
  return createHash("sha256").update(JSON.stringify(seed)).digest("hex");
}
