import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ProdutosTesteClient } from "./produtos-client";
import { getCurrentUser } from "@/lib/auth";
import { connectToDatabase } from "@/lib/db";
import { roleRank } from "@/lib/rbac";
import { activeStoreQueryForUser } from "@/lib/store-scope";
import { Store } from "@/models/Store";
import { listTestProducts } from "@/lib/operations";

export const metadata: Metadata = { title: "Produtos teste · Operação" };

export default async function ProdutosTestePage({
  searchParams,
}: {
  searchParams: Promise<{ store?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const { store: storeId } = await searchParams;
  await connectToDatabase();
  const storeDocs = await Store.find(activeStoreQueryForUser(user))
    .select("name")
    .sort({ name: 1 })
    .lean();
  const stores = storeDocs.map((s) => ({ id: String(s._id), name: s.name }));
  const rows = await listTestProducts(user, storeId);
  const canEdit = roleRank(user.role) >= roleRank("editor");

  return (
    <ProdutosTesteClient
      rows={rows}
      stores={stores}
      canEdit={canEdit}
      storeId={storeId}
    />
  );
}
