import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { canAccessStore } from "@/lib/store-access";
import {
  listStoreVariantsForPricing,
  loadVariantPricingSnapshot,
} from "@/lib/variant-pricing-intelligence";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }

  const url = new URL(request.url);
  const storeId = url.searchParams.get("store")?.trim();
  const variantId = url.searchParams.get("variant")?.trim();

  if (!storeId) {
    return NextResponse.json({ error: "Loja em falta." }, { status: 400 });
  }
  if (!canAccessStore(user.storeAccess, storeId)) {
    return NextResponse.json({ error: "Sem acesso." }, { status: 403 });
  }

  if (!variantId) {
    const variants = await listStoreVariantsForPricing(
      user.workspaceId,
      storeId,
    );
    return NextResponse.json({ variants });
  }

  const snapshot = await loadVariantPricingSnapshot(
    user.workspaceId,
    storeId,
    variantId,
  );
  if (!snapshot) {
    return NextResponse.json({ error: "Variante não encontrada." }, { status: 404 });
  }

  return NextResponse.json({ snapshot });
}
