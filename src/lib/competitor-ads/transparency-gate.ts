import "server-only";
import { connectToDatabase } from "@/lib/db";
import mongoose, { Schema } from "mongoose";

/**
 * Circuit-breaker global para o RPC do Google Ads Transparency.
 * Evita martelar o IP do servidor depois de 429/captcha.
 */

const GateSchema = new Schema(
  {
    key: { type: String, required: true, unique: true },
    blockedUntil: { type: Date, default: null },
    lastBlockedAt: { type: Date, default: null },
    lastOkAt: { type: Date, default: null },
    consecutiveBlocks: { type: Number, default: 0 },
  },
  { timestamps: true },
);

type GateDoc = mongoose.InferSchemaType<typeof GateSchema> & {
  _id: mongoose.Types.ObjectId;
};

const Gate =
  (mongoose.models.CompetitorTransparencyGate as mongoose.Model<GateDoc>) ||
  mongoose.model<GateDoc>("CompetitorTransparencyGate", GateSchema);

const KEY = "global";
/** Após 429, pausa pedidos ao Google (não martelar o IP). */
const BLOCK_MS = 6 * 60 * 60 * 1000;

function envOn(name: string, fallback = "0"): boolean {
  const v = (process.env[name] ?? fallback).trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes" || v === "on";
}

/** SerpAPI key → scrape nos IPs deles (recomendado, sem flag no teu IP). */
export function hasSerpApiKey(): boolean {
  return Boolean(
    process.env.SERPAPI_API_KEY?.trim() || process.env.SERPAPI_KEY?.trim(),
  );
}

/**
 * RPC directo ao Google a partir do servidor — OFF por omissão (causa 429/flag).
 * Ligar só com COMPETITOR_TRANSPARENCY_DIRECT=1 (não recomendado).
 */
export function isDirectTransparencyEnabled(): boolean {
  return envOn("COMPETITOR_TRANSPARENCY_DIRECT", "0");
}

/** Ads ligados se houver SerpAPI ou RPC directo explícito. */
export function isTransparencyEnabledByEnv(): boolean {
  if (hasSerpApiKey()) return true;
  return isDirectTransparencyEnabled();
}

export function getTransparencyProvider(): "serpapi" | "direct" | "off" {
  if (hasSerpApiKey()) return "serpapi";
  if (isDirectTransparencyEnabled()) return "direct";
  return "off";
}

export async function clearTransparencyGate(): Promise<void> {
  await connectToDatabase();
  await Gate.findOneAndUpdate(
    { key: KEY },
    {
      $set: {
        blockedUntil: null,
        consecutiveBlocks: 0,
      },
    },
    { upsert: true },
  );
}

export async function getTransparencyGateStatus(): Promise<{
  enabled: boolean;
  allowed: boolean;
  blockedUntil: string | null;
  reason: string | null;
  provider: "serpapi" | "direct" | "off";
}> {
  const provider = getTransparencyProvider();
  if (provider === "off") {
    return {
      enabled: false,
      allowed: false,
      blockedUntil: null,
      provider,
      reason:
        "Sem ads auto: define SERPAPI_API_KEY (recomendado) ou COMPETITOR_TRANSPARENCY_DIRECT=1.",
    };
  }
  // SerpAPI nunca usa o IP do servidor — sem cooldown local
  if (provider === "serpapi") {
    return {
      enabled: true,
      allowed: true,
      blockedUntil: null,
      provider,
      reason: null,
    };
  }
  await connectToDatabase();
  const doc = await Gate.findOne({ key: KEY }).lean();
  const until = doc?.blockedUntil ? new Date(doc.blockedUntil) : null;
  if (until && until.getTime() > Date.now()) {
    return {
      enabled: true,
      allowed: false,
      blockedUntil: until.toISOString(),
      provider,
      reason: `IP em cooldown até ${until.toISOString()} (Google 429/captcha). Usa SERPAPI_API_KEY para evitar.`,
    };
  }
  return {
    enabled: true,
    allowed: true,
    blockedUntil: null,
    provider,
    reason: null,
  };
}

export async function assertTransparencyAllowed(): Promise<
  { ok: true } | { ok: false; reason: string }
> {
  const s = await getTransparencyGateStatus();
  if (!s.enabled) return { ok: false, reason: s.reason ?? "Desligado" };
  if (!s.allowed) return { ok: false, reason: s.reason ?? "Bloqueado" };
  return { ok: true };
}

export async function markTransparencyBlocked(reason?: string) {
  await connectToDatabase();
  const until = new Date(Date.now() + BLOCK_MS);
  await Gate.findOneAndUpdate(
    { key: KEY },
    {
      $set: {
        blockedUntil: until,
        lastBlockedAt: new Date(),
      },
      $inc: { consecutiveBlocks: 1 },
    },
    { upsert: true },
  );
  return { blockedUntil: until, reason: reason ?? "429" };
}

export async function markTransparencyOk() {
  await connectToDatabase();
  await Gate.findOneAndUpdate(
    { key: KEY },
    {
      $set: {
        lastOkAt: new Date(),
        consecutiveBlocks: 0,
        blockedUntil: null,
      },
    },
    { upsert: true },
  );
}
