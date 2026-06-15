"use client";

import Link from "next/link";
import { Suspense } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { mobileNavForStoreScope } from "@/lib/nav";
import { cn } from "@/lib/utils";
import { hrefWithScope } from "@/lib/scope-query";

function BottomNavLinks() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const storeId = searchParams.get("store");
  const items = mobileNavForStoreScope(storeId);

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 flex border-t border-border bg-surface md:hidden">
      {items.map((item) => {
        const active =
          pathname === item.href || pathname.startsWith(item.href + "/");
        const Icon = item.icon;
        const href = hrefWithScope(item.href, searchParams);
        return (
          <Link
            key={item.href}
            href={href}
            className={cn(
              "flex flex-1 flex-col items-center gap-1 py-2.5 text-[11px] font-medium",
              active ? "text-accent" : "text-muted-foreground",
            )}
          >
            <Icon className="h-5 w-5" />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

export function BottomNav() {
  return (
    <Suspense fallback={null}>
      <BottomNavLinks />
    </Suspense>
  );
}
