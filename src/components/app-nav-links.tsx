"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { navItemsForStoreScope, type NavItem } from "@/lib/nav";
import { cn } from "@/lib/utils";
import { hrefWithScope } from "@/lib/scope-query";

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
  const searchParams = useSearchParams();
  const storeId = searchParams.get("store");
  const nav = items ?? navItemsForStoreScope(storeId);

  if (variant === "horizontal") {
    return (
      <nav className="flex items-center gap-0.5">
        {nav.map((item) => {
          const active = isActive(pathname, item.href);
          const href = hrefWithScope(item.href, searchParams);
          return (
            <Link
              key={item.href}
              href={href}
              className={cn(
                "whitespace-nowrap rounded-lg px-2.5 py-1.5 text-sm font-medium transition-colors",
                active
                  ? "bg-muted text-accent"
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
    <nav className="flex-1 space-y-1 p-3">
      {nav.map((item) => {
        const active = isActive(pathname, item.href);
        const Icon = item.icon;
        const href = hrefWithScope(item.href, searchParams);
        return (
          <Link
            key={item.href}
            href={href}
            className={cn(
              "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium",
              active
                ? "bg-muted text-accent"
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
