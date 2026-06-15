"use client";

import { startTransition, useEffect } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  storeRequiredPaths,
  workspaceOnlyPaths,
} from "@/lib/nav";
import { hrefWithScope } from "@/lib/scope-query";

/**
 * Ajusta rotas consoante o scope (workspace vs loja).
 */
export function ScopeRouteGuard() {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const storeId = searchParams.get("store");

  useEffect(() => {
    if (storeId && workspaceOnlyPaths.has(pathname)) {
      startTransition(() => {
        router.replace(hrefWithScope("/dashboard", searchParams));
      });
      return;
    }
    if (!storeId && storeRequiredPaths.has(pathname)) {
      startTransition(() => {
        router.replace(hrefWithScope("/dashboard", searchParams));
      });
    }
  }, [pathname, router, searchParams, storeId]);

  return null;
}
