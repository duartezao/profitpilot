"use client";

import { StoreSyncButton } from "@/components/store-sync-button";

/** Mantido para /lojas — delega em StoreSyncButton. */
export function SyncButton({ storeId }: { storeId: string }) {
  return <StoreSyncButton storeId={storeId} />;
}
