import "server-only";
import { createHash, timingSafeEqual } from "node:crypto";

/** Comparação constante no tempo (segredos / CRON_SECRET). */
export function timingSafeStringEqual(a: string, b: string): boolean {
  const ha = createHash("sha256").update(a, "utf8").digest();
  const hb = createHash("sha256").update(b, "utf8").digest();
  return timingSafeEqual(ha, hb);
}
