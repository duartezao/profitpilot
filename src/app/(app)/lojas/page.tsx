import type { Metadata } from "next";
import Link from "next/link";
import { Plus, Store as StoreIcon } from "lucide-react";
import { getCurrentUser } from "@/lib/auth";
import { connectToDatabase } from "@/lib/db";
import { formatGlobalSyncInterval } from "@/lib/sync-config";
import { Store } from "@/models/Store";
import { storeQueryForUser } from "@/lib/store-scope";
import { SyncButton } from "./sync-button";
import { getStoreDisplayUrl } from "@/lib/store-display";

export const metadata: Metadata = { title: "Lojas" };

const statusLabel: Record<string, string> = {
  active: "Ativa",
  paused: "Pausada",
  archived: "Arquivada",
};

const statusCls: Record<string, string> = {
  active: "text-positive",
  paused: "text-warning",
  archived: "text-muted-foreground",
};

export default async function LojasPage() {
  const user = await getCurrentUser();
  if (!user) return null;
  await connectToDatabase();

  const stores = await Store.find(storeQueryForUser(user))
    .sort({ createdAt: -1 })
    .lean();

  const syncIntervalLabel = formatGlobalSyncInterval();

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Lojas</h1>
          <p className="text-sm text-muted-foreground">
            Liga e gere as tuas lojas Shopify.
          </p>
        </div>
        <Link
          href="/lojas/nova"
          className="inline-flex items-center gap-2 rounded-lg bg-accent px-3 py-2 text-sm font-medium text-accent-foreground hover:opacity-90"
        >
          <Plus className="h-4 w-4" />
          Adicionar loja
        </Link>
      </div>

      {stores.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border bg-surface p-12 text-center">
          <StoreIcon className="h-8 w-8 text-muted-foreground" />
          <p className="mt-3 text-sm font-medium">Ainda não tens lojas ligadas.</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Liga a tua primeira loja Shopify para começares a ver o lucro real.
          </p>
          <Link
            href="/lojas/nova"
            className="mt-4 inline-flex items-center gap-2 rounded-lg bg-accent px-3 py-2 text-sm font-medium text-accent-foreground hover:opacity-90"
          >
            <Plus className="h-4 w-4" />
            Adicionar loja
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {stores.map((s) => {
            const id = String(s._id);
            const status = s.status ?? "active";
            return (
              <div
                key={id}
                className="rounded-lg border border-border bg-surface p-5"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-medium" data-sensitive>{s.name}</p>
                    <p className="truncate text-sm text-muted-foreground" data-sensitive>
                      {getStoreDisplayUrl(s) ?? s.shopDomain}
                    </p>
                  </div>
                  <span
                    className={`shrink-0 text-xs font-medium ${statusCls[status] ?? ""}`}
                  >
                    {statusLabel[status] ?? status}
                  </span>
                </div>
                <div className="mt-4 flex items-center justify-between text-sm text-muted-foreground">
                  <span>Moeda: {s.currency}</span>
                  <span className="tabular-nums">
                    {s.lastSyncAt
                      ? `Sync: ${new Date(s.lastSyncAt).toLocaleString("pt-PT")}`
                      : "Sem sincronização"}
                  </span>
                </div>
                {s.lastSyncError && (
                  <p className="mt-2 text-xs text-negative">
                    Último erro: {s.lastSyncError}
                  </p>
                )}
                <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3">
                  <SyncButton storeId={id} />
                  <Link
                    href={`/dashboard?store=${id}`}
                    className="text-sm font-medium text-accent hover:underline"
                  >
                    Abrir dashboard
                  </Link>
                  {s.autoSync && (
                    <span className="text-xs text-muted-foreground">
                      Auto · a cada {syncIntervalLabel}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
