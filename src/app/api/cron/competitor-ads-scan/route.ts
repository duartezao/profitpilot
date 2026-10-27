import { NextResponse } from "next/server";
import mongoose from "mongoose";
import { connectToDatabase } from "@/lib/db";
import { Workspace } from "@/models/Workspace";
import { runCompetitorDiscovery } from "@/lib/competitor-ads/discovery";
import { timingSafeStringEqual } from "@/lib/timing-safe";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Discovery diário: seeds + Impressum (sem Transparency / sem flag no IP).
 * Authorization: Bearer CRON_SECRET
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json(
      { error: "CRON_SECRET não configurado." },
      { status: 500 },
    );
  }

  const auth = request.headers.get("authorization");
  const provided = auth?.replace(/^Bearer\s+/i, "") ?? "";
  if (!provided || !timingSafeStringEqual(provided, secret)) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }

  await connectToDatabase();
  const workspaces = await Workspace.find({})
    .select("_id")
    .limit(50)
    .lean();

  const results: Array<{
    workspaceId: string;
    ok: boolean;
    newCompanies?: number;
    newDomains?: number;
    error?: string;
  }> = [];

  for (const ws of workspaces) {
    try {
      const r = await runCompetitorDiscovery(ws._id as mongoose.Types.ObjectId, {
        trigger: "cron",
        maxDepth: 2,
        maxDomains: 40,
        includeAds: true,
      });
      results.push({
        workspaceId: String(ws._id),
        ok: true,
        newCompanies: r.newCompanies,
        newDomains: r.newDomains,
      });
    } catch (e) {
      results.push({
        workspaceId: String(ws._id),
        ok: false,
        error: e instanceof Error ? e.message : "erro",
      });
    }
  }

  return NextResponse.json(
    { ok: true, results },
    { headers: { "Cache-Control": "no-store" } },
  );
}
