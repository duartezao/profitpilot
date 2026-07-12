import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { connectToDatabase } from "@/lib/db";
import { Store } from "@/models/Store";
import { canAccessStore } from "@/lib/store-access";
import {
  appliesAutoEuCustomsFees,
  buildEuCustomsFeeAutoSummary,
  purgeLegacyManualEuFeesForStore,
} from "@/lib/eu-category-fees";
import { getBaseCurrency } from "@/lib/manual-cogs";
import type { CogsMode } from "@/lib/cogs-modes";

export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }

  const url = new URL(req.url);
  const storeId = url.searchParams.get("store")?.trim();
  if (!storeId) {
    return NextResponse.json({ error: "Loja em falta." }, { status: 400 });
  }
  if (!canAccessStore(user.storeAccess, storeId)) {
    return NextResponse.json({ error: "Sem acesso." }, { status: 403 });
  }

  await connectToDatabase();
  const store = await Store.findById(storeId)
    .select("name cogsMode workspaceId ianaTimezone importStartDate createdAt analyticsSessionCountry")
    .lean();
  if (!store) {
    return NextResponse.json({ error: "Loja não encontrada." }, { status: 404 });
  }

  const mode = (store.cogsMode ?? "shopify") as CogsMode;
  if (!appliesAutoEuCustomsFees(mode)) {
    return NextResponse.json({ automatic: false });
  }

  await purgeLegacyManualEuFeesForStore(store._id);

  const baseCurrency = await getBaseCurrency(store.workspaceId);
  const summary = await buildEuCustomsFeeAutoSummary(store, baseCurrency);

  return NextResponse.json(summary);
}
