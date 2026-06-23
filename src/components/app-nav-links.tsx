"use client";

import Link from "next/link";
import { useEffect, useMemo } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { navItemsForStoreScope, type NavItem } from "@/lib/nav";
import { cn } from "@/lib/utils";
import { hrefWithScope } from "@/lib/scope-query";
import { useAppViewModeContext } from "@/components/app-view-mode-provider";
import { homePathForMode } from "@/lib/app-view-mode";

function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(href + "/");
}

export function AppNavLinks({
  items,
  variant = "sidebar",
}: {
  items?: NavItem[];
  variant?: "sidebar" | "horizontal";
}) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const storeId = searchParams.get("store");
  const { mode } = useAppViewModeContext();
  const nav = items ?? navItemsForStoreScope(storeId, mode);

  const hrefs = useMemo(
    () => nav.map((item) => hrefWithScope(item.href, searchParams)),
    [nav, searchParams],
  );

  useEffect(() => {
    router.prefetch(hrefWithScope(homePathForMode(mode), searchParams));
    for (const href of hrefs) {
      router.prefetch(href);
    }
  }, [hrefs, mode, router, searchParams]);

  const linkKey = `${mode}-${storeId ?? "all"}`;
  if (variant === "horizontal") {
    return (
      <nav key={linkKey} className="flex items-center gap-0.5">
        {nav.map((item) => {
          const active = isActive(pathname, item.href);
          const href = hrefWithScope(item.href, searchParams);
          return (
            <Link
              key={item.href}
              href={href}
              prefetch
              scroll={false}
              className={cn(
                "whitespace-nowrap rounded-lg px-2.5 py-1.5 text-sm font-medium transition-colors",
                active
                  ? "bg-accent/10 text-accent dark:bg-muted"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>
    );
  }

  return (
    <nav key={linkKey} className="space-y-1 p-3">
      {nav.map((item) => {
        const active = isActive(pathname, item.href);
        const Icon = item.icon;
        const href = hrefWithScope(item.href, searchParams);
        return (
          <Link
            key={item.href}
            href={href}
            prefetch
            scroll={false}
            className={cn(
              "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium",
              active
                ? "bg-accent/10 text-accent dark:bg-muted"
                : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            <Icon className="h-4 w-4 shrink-0" />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
