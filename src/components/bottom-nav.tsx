"use client";

import Link from "next/link";
import { useLinkStatus } from "next/link";
import { Suspense, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  isMobileMoreNavItem,
  mobileNavForStoreScope,
  mobileOverflowNavItems,
  type NavItem,
} from "@/lib/nav";
import { MobileNavMoreMenu } from "@/components/mobile-nav-more-menu";
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
  const overflowItems = mobileOverflowNavItems(storeId);
  const [moreOpen, setMoreOpen] = useState(false);

  const hrefs = useMemo(
    () =>
      items.map((item) =>
        isMobileMoreNavItem(item)
          ? null
          : hrefWithScope(item.href, searchParams),
      ),
    [items, searchParams],
  );

  const overflowHrefs = useMemo(
    () => overflowItems.map((i) => i.href),
    [overflowItems],
  );

  const moreActive = overflowHrefs.some(
    (href) => pathname === href || pathname.startsWith(href + "/"),
  );

  useEffect(() => {
    for (const href of hrefs) {
      if (href) router.prefetch(href);
    }
    for (const item of overflowItems) {
      router.prefetch(hrefWithScope(item.href, searchParams));
    }
  }, [hrefs, overflowItems, router, searchParams]);

  useEffect(() => {
    setMoreOpen(false);
  }, [pathname]);

  return (
    <>
      <MobileNavMoreMenu
        open={moreOpen}
        onClose={() => setMoreOpen(false)}
        items={overflowItems}
      />

      <nav className="fixed inset-x-0 bottom-0 z-40 flex border-t border-border bg-surface pb-[env(safe-area-inset-bottom)] md:hidden">
        {items.map((item, i) => {
          if (isMobileMoreNavItem(item)) {
            const Icon = item.icon;
            return (
              <button
                key={item.href}
                type="button"
                onClick={() => setMoreOpen((v) => !v)}
                aria-expanded={moreOpen}
                aria-haspopup="dialog"
                className={cn(
                  "flex flex-1 flex-col items-center gap-1 py-2.5 text-[11px] font-medium touch-manipulation",
                  moreOpen || moreActive
                    ? "text-accent"
                    : "text-muted-foreground",
                )}
              >
                <Icon className="h-5 w-5" />
                <span>{item.label}</span>
              </button>
            );
          }

          const active =
            pathname === item.href || pathname.startsWith(item.href + "/");
          const href = hrefs[i]!;
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
    </>
  );
}

export function BottomNav() {
  return (
    <Suspense fallback={null}>
      <BottomNavLinks />
    </Suspense>
  );
}
