import { NextResponse } from "next/server";
import {
  requireUser,
  requireWorkspaceStore,
  authErrorResponse,
} from "@/lib/require-auth";
import { connectToDatabase } from "@/lib/db";
import { findStoreForUser } from "@/lib/store-scope";
import {
  appliesAutoEuCustomsFees,
  buildEuCustomsFeeAutoSummary,
  purgeLegacyManualEuFeesForStore,
} from "@/lib/eu-category-fees";
import { getBaseCurrency } from "@/lib/manual-cogs";
import type { CogsMode } from "@/lib/cogs-modes";

export async function GET(req: Request) {
  try {
    const user = await requireUser();
    const url = new URL(req.url);
    const storeId = url.searchParams.get("store")?.trim();
    if (!storeId) {
      return NextResponse.json({ error: "Loja em falta." }, { status: 400 });
    }

    await requireWorkspaceStore(user, storeId, { activeOnly: true });
    await connectToDatabase();

    const store = await findStoreForUser(
      user,
      storeId,
      "name cogsMode workspaceId ianaTimezone importStartDate createdAt analyticsSessionCountry",
      { activeOnly: true },
    );
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
  } catch (e) {
    return authErrorResponse(e);
  }
}
