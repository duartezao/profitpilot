"use client";

import Link from "next/link";
import { Suspense } from "react";
import { AppNavLinks } from "@/components/app-nav-links";
import { AppLogo } from "@/components/app-logo";
import { useAppViewModeContext } from "@/components/app-view-mode-provider";
import { homePathForMode } from "@/lib/app-view-mode";
import { hrefWithScope } from "@/lib/scope-query";
import { useSearchParams } from "next/navigation";

function SidebarLogo() {
  const { mode } = useAppViewModeContext();
  const searchParams = useSearchParams();
  const home = hrefWithScope(homePathForMode(mode), searchParams);

  return (
    <Link href={home} className="flex min-w-0 items-center">
      <AppLogo />
    </Link>
  );
}

export function AppSidebar() {
  return (
    <aside className="hidden h-dvh w-60 shrink-0 flex-col border-r border-border bg-sidebar lg:flex lg:overflow-hidden xl:w-64">
      <div className="flex h-16 shrink-0 items-center px-6 pt-1">
        <Suspense fallback={<AppLogo />}>
          <SidebarLogo />
        </Suspense>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-6 pt-2">
        <Suspense
          fallback={
            <div className="space-y-2 px-2">
              {Array.from({ length: 8 }).map((_, i) => (
                <div
                  key={i}
                  className="h-10 animate-pulse rounded-lg bg-muted/60"
                />
              ))}
            </div>
          }
        >
          <AppNavLinks />
        </Suspense>
      </div>
    </aside>
  );
}
