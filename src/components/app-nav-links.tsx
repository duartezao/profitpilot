"use client";

import Link from "next/link";
import { useLinkStatus } from "next/link";
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
import { TAP_PRESS } from "@/lib/ui-press";

function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(href + "/");
}

function NavLinkInner({
  item,
  pending,
  collapsed,
}: {
  item: NavItem;
  pending: boolean;
  collapsed?: boolean;
}) {
  const Icon = item.icon;
  return (
    <>
      <Icon
        className={cn(
          "h-4 w-4 shrink-0 transition-opacity duration-100",
          collapsed && "h-[18px] w-[18px]",
          pending && "opacity-40",
        )}
      />
      {!collapsed && (
        <span className={cn(pending && "opacity-60")}>{item.label}</span>
      )}
      {collapsed && <span className="sr-only">{item.label}</span>}
    </>
  );
}

function NavLinkStatus({
  item,
  collapsed,
}: {
  item: NavItem;
  collapsed?: boolean;
}) {
  const { pending } = useLinkStatus();
  return <NavLinkInner item={item} pending={pending} collapsed={collapsed} />;
}

function NavLink({
  item,
  pathname,
  href,
  compact,
  collapsed,
}: {
  item: NavItem;
  pathname: string;
  href: string;
  compact?: boolean;
  collapsed?: boolean;
}) {
  const active = isActive(pathname, item.href);
  return (
    <Link
      href={href}
      prefetch
      scroll={false}
      title={collapsed ? item.label : undefined}
      className={cn(
        TAP_PRESS,
        "flex items-center gap-3 rounded-lg text-sm font-medium",
        collapsed
          ? "justify-center px-0 py-2.5"
          : compact
            ? "px-2.5 py-1.5"
            : "px-3 py-2.5",
        active
          ? "bg-accent/10 text-accent dark:bg-muted"
          : "text-muted-foreground hover:bg-muted/80 hover:text-foreground",
      )}
    >
      <NavLinkStatus item={item} collapsed={collapsed} />
    </Link>
  );
}

export function AppNavLinks({
  items,
  variant = "sidebar",
  collapsed = false,
}: {
  items?: NavItem[];
  variant?: "sidebar" | "horizontal";
  /** Só ícones — sidebar estreita. */
  collapsed?: boolean;
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

  const showGroups =
    !collapsed &&
    (groups.length > 1 || (groups[0]?.label ?? "").length > 0);

  if (!showGroups) {
    return (
      <nav key={linkKey} className="space-y-1">
        {flatNav.map((item) => (
          <NavLink
            key={item.href}
            item={item}
            pathname={pathname}
            href={hrefWithScope(item.href, searchParams)}
            collapsed={collapsed}
          />
        ))}
      </nav>
    );
  }

  return (
    <nav key={linkKey} className="space-y-6">
      {groups.map((group) => (
        <div key={group.label || "main"}>
          {group.label ? (
            <p className="mb-2.5 px-3 text-[11px] font-medium uppercase tracking-wider text-muted-foreground/80">
              {group.label}
            </p>
          ) : null}
          <div className="space-y-1">
            {group.items.map((item) => (
              <NavLink
                key={item.href}
                item={item}
                pathname={pathname}
                href={hrefWithScope(item.href, searchParams)}
                collapsed={collapsed}
              />
            ))}
          </div>
        </div>
      ))}
    </nav>
  );
}
