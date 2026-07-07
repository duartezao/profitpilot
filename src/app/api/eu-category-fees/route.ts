import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { connectToDatabase } from "@/lib/db";
import { Store } from "@/models/Store";
import { canAccessStore } from "@/lib/store-access";
import {
  appliesEuCategoryFees,
  listRecentEuCategoryFees,
} from "@/lib/eu-category-fees";
import { getBaseCurrency } from "@/lib/manual-cogs";
import type { CogsMode } from "@/lib/cogs-modes";

const ROLES_EDIT = ["owner", "admin", "editor"] as const;

export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }

  const storeId = new URL(req.url).searchParams.get("store");
  if (!storeId) {
    return NextResponse.json({ error: "Loja em falta." }, { status: 400 });
  }
  if (!canAccessStore(user.storeAccess, storeId)) {
    return NextResponse.json({ error: "Sem acesso." }, { status: 403 });
  }

  await connectToDatabase();
  const store = await Store.findById(storeId)
    .select("name cogsMode cogsInputCurrency workspaceId")
    .lean();
  if (!store) {
    return NextResponse.json({ error: "Loja não encontrada." }, { status: 404 });
  }

  const mode = (store.cogsMode ?? "shopify") as CogsMode;
  if (!appliesEuCategoryFees(mode)) {
    return NextResponse.json({ applies: false });
  }

  const baseCurrency = await getBaseCurrency(store.workspaceId);
  const entries = await listRecentEuCategoryFees(store._id, baseCurrency);

  return NextResponse.json({
    applies: true,
    storeId,
    storeName: store.name,
    baseCurrency,
    inputCurrency: store.cogsInputCurrency ?? "EUR",
    entries,
    canEdit: ROLES_EDIT.includes(user.role as (typeof ROLES_EDIT)[number]),
  });
}
