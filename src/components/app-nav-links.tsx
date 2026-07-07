"use client";

import Link from "next/link";
import { useEffect, useMemo } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  navGroupsForStoreScope,
  navItemsForStoreScope,
  type NavItem,
} from "@/lib/nav";
import { cn } from "@/lib/utils";
import { hrefWithScope } from "@/lib/scope-query";
import { useAppViewModeContext } from "@/components/app-view-mode-provider";
import { homePathForMode } from "@/lib/app-view-mode";

function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(href + "/");
}

function NavLink({
  item,
  pathname,
  href,
  compact,
}: {
  item: NavItem;
  pathname: string;
  href: string;
  compact?: boolean;
}) {
  const active = isActive(pathname, item.href);
  const Icon = item.icon;
  return (
    <Link
      href={href}
      prefetch
      scroll={false}
      className={cn(
        "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium",
        compact ? "px-2.5 py-1.5" : "",
        active
          ? "bg-accent/10 text-accent dark:bg-muted"
          : "text-muted-foreground hover:bg-muted hover:text-foreground",
      )}
    >
      <Icon className="h-4 w-4 shrink-0" />
      {item.label}
    </Link>
  );
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
  const groups = navGroupsForStoreScope(storeId, mode);
  const flatNav = items ?? navItemsForStoreScope(storeId, mode);

  const hrefs = useMemo(
    () => flatNav.map((item) => hrefWithScope(item.href, searchParams)),
    [flatNav, searchParams],
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
        {flatNav.map((item) => (
          <NavLink
            key={item.href}
            item={item}
            pathname={pathname}
            href={hrefWithScope(item.href, searchParams)}
            compact
          />
        ))}
      </nav>
    );
  }

  const showGroups = groups.length > 1 || (groups[0]?.label ?? "").length > 0;

  if (!showGroups) {
    return (
      <nav key={linkKey} className="space-y-1 p-3">
        {flatNav.map((item) => (
          <NavLink
            key={item.href}
            item={item}
            pathname={pathname}
            href={hrefWithScope(item.href, searchParams)}
          />
        ))}
      </nav>
    );
  }

  return (
    <nav key={linkKey} className="space-y-4 p-3">
      {groups.map((group) => (
        <div key={group.label || "main"}>
          {group.label ? (
            <p className="mb-1.5 px-3 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              {group.label}
            </p>
          ) : null}
          <div className="space-y-0.5">
            {group.items.map((item) => (
              <NavLink
                key={item.href}
                item={item}
                pathname={pathname}
                href={hrefWithScope(item.href, searchParams)}
              />
            ))}
          </div>
        </div>
      ))}
    </nav>
  );
}
