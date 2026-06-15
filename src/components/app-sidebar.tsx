"use client";

import Link from "next/link";
import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { AppNavLinks } from "@/components/app-nav-links";
import { Sensitive } from "@/components/privacy-mode";
import { LayoutGrid, Store as StoreIcon } from "lucide-react";

function SidebarScopeLabel({ stores }: { stores: { id: string; name: string }[] }) {
  const params = useSearchParams();
  const storeId = params.get("store");
  const storeName = storeId
    ? stores.find((s) => s.id === storeId)?.name
    : null;

  if (storeName) {
    return (
      <div className="border-b border-border px-4 py-3">
        <p className="text-xs font-medium text-muted-foreground">Loja ativa</p>
        <p className="mt-0.5 flex items-center gap-2 truncate text-sm font-semibold">
          <StoreIcon className="h-4 w-4 shrink-0 text-accent" />
          <Sensitive className="truncate">{storeName}</Sensitive>
        </p>
      </div>
    );
  }

  return (
    <div className="border-b border-border px-4 py-3">
      <p className="text-xs font-medium text-muted-foreground">Visão</p>
      <p className="mt-0.5 flex items-center gap-2 text-sm font-semibold">
        <LayoutGrid className="h-4 w-4 shrink-0 text-muted-foreground" />
        Todas as lojas
      </p>
    </div>
  );
}

export function AppSidebar({
  stores,
}: {
  stores: { id: string; name: string }[];
}) {
  return (
    <aside className="hidden w-60 shrink-0 flex-col border-r border-border bg-surface md:flex">
      <div className="flex h-14 items-center gap-2 border-b border-border px-5">
        <Link href="/dashboard" className="flex min-w-0 items-center gap-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/icon.svg" alt="" className="h-6 w-6 rounded" />
          <span className="truncate text-base font-semibold tracking-tight">
            Profit<span className="text-accent">Pilot</span>
          </span>
        </Link>
      </div>

      <Suspense
        fallback={
          <div className="border-b border-border px-4 py-3">
            <div className="h-8 animate-pulse rounded bg-muted" />
          </div>
        }
      >
        <SidebarScopeLabel stores={stores} />
      </Suspense>

      <Suspense
        fallback={
          <div className="flex-1 space-y-1 p-3">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="h-9 animate-pulse rounded-lg bg-muted/60" />
            ))}
          </div>
        }
      >
        <AppNavLinks />
      </Suspense>
    </aside>
  );
}
