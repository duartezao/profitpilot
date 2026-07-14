import "server-only";
import { revalidateTag } from "next/cache";

function isRevalidateContextError(message: string): boolean {
  const m = message.toLowerCase();
  return (
    m.includes("static generation store missing") ||
    m.includes("invariant:") ||
    m.includes("revalidatetag") && m.includes("missing")
  );
}

/**
 * Invalida cache por tag quando o contexto Next.js o permite (route handler, server action).
 * Em cron, instrumentation ou workers ignora silenciosamente — o TTL (60 s) expira sozinho.
 */
export function safeRevalidateTag(tag: string): void {
  try {
    revalidateTag(tag, { expire: 0 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (isRevalidateContextError(msg)) return;
    throw e;
  }
}
