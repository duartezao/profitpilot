"use client";

import Link from "next/link";
import { useLinkStatus } from "next/link";
import { Suspense, useEffect, useMemo } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { mobileNavForStoreScope, type NavItem } from "@/lib/nav";
import { cn } from "@/lib/utils";
import { hrefWithScope } from "@/lib/scope-query";

function NavItemInner({
  label,
  icon: Icon,
}: {
  label: string;
  icon: NavItem["icon"];
}) {
  const { pending } = useLinkStatus();

  return (
    <>
      <Icon
        className={cn(
          "h-5 w-5 transition-opacity",
          pending && "opacity-40",
        )}
      />
      <span className={cn(pending && "opacity-60")}>{label}</span>
    </>
  );
}

function BottomNavLinks() {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const storeId = searchParams.get("store");
  const items = mobileNavForStoreScope(storeId);

  const hrefs = useMemo(
    () => items.map((item) => hrefWithScope(item.href, searchParams)),
    [items, searchParams],
  );

  useEffect(() => {
    for (const href of hrefs) {
      router.prefetch(href);
    }
  }, [hrefs, router]);

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 flex border-t border-border bg-surface md:hidden">
      {items.map((item, i) => {
        const active =
          pathname === item.href || pathname.startsWith(item.href + "/");
        const href = hrefs[i];
        return (
          <Link
            key={item.href}
            href={href}
            prefetch
            scroll={false}
            className={cn(
              "flex flex-1 flex-col items-center gap-1 py-2.5 text-[11px] font-medium touch-manipulation",
              active ? "text-accent" : "text-muted-foreground",
            )}
          >
            <NavItemInner label={item.label} icon={item.icon} />
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
