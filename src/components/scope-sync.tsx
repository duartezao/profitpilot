"use client";

import { startTransition, useEffect, useRef } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import {
  clearPersistedStore,
  getPersistedStore,
  persistActiveStore,
} from "@/lib/scope-query";

/**
 * Mantém a loja selecionada na URL ao mudar de página
 * (restaura de sessionStorage quando o link não traz ?store=).
 */
export function ScopeSync({
  workspaceId,
  storeIds,
}: {
  workspaceId: string;
  storeIds: string[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const storeIdsRef = useRef(storeIds);
  storeIdsRef.current = storeIds;

  useEffect(() => {
    const ids = storeIdsRef.current;
    const current = searchParams.get("store");

    function stripStoreFromUrl() {
      const next = new URLSearchParams(searchParams.toString());
      next.delete("store");
      clearPersistedStore(workspaceId);
      const qs = next.toString();
      startTransition(() => {
        router.replace(qs ? `${pathname}?${qs}` : pathname);
      });
    }

    if (ids.length === 0) {
      if (current) stripStoreFromUrl();
      return;
    }

    if (current && ids.includes(current)) {
      persistActiveStore(workspaceId, current);
      return;
    }

    if (current && !ids.includes(current)) {
      stripStoreFromUrl();
      return;
    }

    const persisted = getPersistedStore(workspaceId);
    if (!persisted || !ids.includes(persisted)) return;

    const next = new URLSearchParams(searchParams.toString());
    next.set("store", persisted);
    const qs = next.toString();
    startTransition(() => {
      router.replace(qs ? `${pathname}?${qs}` : pathname);
    });
  }, [workspaceId, pathname, searchParams, router]);

  return null;
}
