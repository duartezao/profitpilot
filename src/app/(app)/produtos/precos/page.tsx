import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { canAccessStore } from "@/lib/store-access";
import { PrecosClient } from "./precos-client";

export const metadata: Metadata = { title: "Preço & COGS · Produtos" };

export default async function ProdutosPrecosPage({
  searchParams,
}: {
  searchParams: Promise<{ store?: string; variant?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const { store: storeId, variant: variantId } = await searchParams;
  if (!storeId) redirect("/dashboard");
  if (!canAccessStore(user.storeAccess, storeId)) redirect("/dashboard");

  return <PrecosClient storeId={storeId} initialVariantId={variantId ?? ""} />;
}
