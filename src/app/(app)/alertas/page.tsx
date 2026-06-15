import type { Metadata } from "next";
import { getCurrentUser } from "@/lib/auth";
import { connectToDatabase } from "@/lib/db";
import { Store } from "@/models/Store";
import { buildWorkspaceAlerts } from "@/lib/alerts";
import { storeQueryForUser } from "@/lib/store-scope";
import { canAccessStore } from "@/lib/store-access";
import { AlertsList } from "./alerts-list";

export const metadata: Metadata = { title: "Alertas" };
export const dynamic = "force-dynamic";

export default async function AlertasPage({
  searchParams,
}: {
  searchParams: Promise<{ store?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) return null;
  const { store: storeId } = await searchParams;
  await connectToDatabase();

  const store =
    storeId && canAccessStore(user.storeAccess, storeId)
      ? await Store.findOne(storeQueryForUser(user, { _id: storeId }))
          .select("name")
          .lean()
      : null;

  const alerts = await buildWorkspaceAlerts(
    { workspaceId: user.workspaceId, storeAccess: user.storeAccess },
    store ? { storeId: String(store._id) } : undefined,
  );

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          {store ? `Alertas · ${store.name}` : "Alertas"}
        </h1>
        <p className="text-sm text-muted-foreground">
          {store
            ? "Sync, COGS, ad spend e lucro desta loja."
            : "Problemas de dados e operação em todas as lojas acessíveis."}
        </p>
      </div>
      <AlertsList alerts={alerts} />
    </div>
  );
}
