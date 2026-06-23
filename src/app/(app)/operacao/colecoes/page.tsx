import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ColecoesClient } from "./colecoes-client";
import { getCurrentUser } from "@/lib/auth";
import { connectToDatabase } from "@/lib/db";
import { roleRank } from "@/lib/rbac";
import { activeStoreQueryForUser } from "@/lib/store-scope";
import { Store } from "@/models/Store";
import { listTestCollections } from "@/lib/operations";

export const metadata: Metadata = { title: "Coleções · Operação" };

export default async function ColecoesPage({
  searchParams,
}: {
  searchParams: Promise<{ store?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const { store: storeId } = await searchParams;
  await connectToDatabase();
  const storeDocs = await Store.find(activeStoreQueryForUser(user))
    .select("name collectionTestCycleDays collectionReminderDaysBefore")
    .sort({ name: 1 })
    .lean();
  const stores = storeDocs.map((s) => ({
    id: String(s._id),
    name: s.name,
    cycleDays: s.collectionTestCycleDays ?? 5,
    reminderDaysBefore: s.collectionReminderDaysBefore ?? 2,
  }));
  const rows = await listTestCollections(user, storeId);
  const canEdit = roleRank(user.role) >= roleRank("editor");

  return (
    <ColecoesClient
      rows={rows}
      stores={stores}
      canEdit={canEdit}
      storeId={storeId}
    />
  );
}
