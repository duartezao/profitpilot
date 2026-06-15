"use client";

import Link from "next/link";
import { Suspense } from "react";
import { AppNavLinks } from "@/components/app-nav-links";
import { AppLogo } from "@/components/app-logo";

export function AppSidebar() {
  return (
    <aside className="hidden w-60 shrink-0 flex-col border-r border-border bg-sidebar md:flex">
      <div className="flex h-14 items-center border-b border-border px-5">
        <Link href="/dashboard" className="flex min-w-0 items-center">
          <AppLogo />
        </Link>
      </div>

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
