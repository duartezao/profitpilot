"use client";

import Link from "next/link";
import { useEffect } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { X } from "lucide-react";
import {
  mobileOverflowNavGroups,
  mobileOverflowNavItems,
  type NavGroup,
  type NavItem,
} from "@/lib/nav";
import { cn } from "@/lib/utils";
import { hrefWithScope } from "@/lib/scope-query";
import { useAppViewModeContext } from "@/components/app-view-mode-provider";
import { TAP_PRESS } from "@/lib/ui-press";

function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(href + "/");
}

function NavRow({
  item,
  pathname,
  searchParams,
  onClose,
}: {
  item: NavItem;
  pathname: string;
  searchParams: URLSearchParams;
  onClose: () => void;
}) {
  const active = isActive(pathname, item.href);
  const Icon = item.icon;
  const href = hrefWithScope(item.href, searchParams);

  return (
    <li>
      <Link
        href={href}
        prefetch
        scroll={false}
        onClick={onClose}
        className={cn(
          TAP_PRESS,
          "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium",
          active
            ? "bg-accent/10 text-accent dark:bg-muted"
            : "text-foreground hover:bg-muted",
        )}
      >
        <Icon className="h-4 w-4 shrink-0" />
        {item.label}
      </Link>
    </li>
  );
}

function GroupBlock({
  group,
  pathname,
  searchParams,
  onClose,
}: {
  group: NavGroup;
  pathname: string;
  searchParams: URLSearchParams;
  onClose: () => void;
}) {
  return (
    <div>
      {group.label ? (
        <p className="mb-1 px-3 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          {group.label}
        </p>
      ) : null}
      <ul className="space-y-0.5">
        {group.items.map((item) => (
          <NavRow
            key={item.href}
            item={item}
            pathname={pathname}
            searchParams={searchParams}
            onClose={onClose}
          />
        ))}
      </ul>
    </div>
  );
}

export function MobileNavMoreMenu({
  open,
  onClose,
  items,
  title = "Mais secções",
}: {
  open: boolean;
  onClose: () => void;
  items: NavItem[];
  title?: string;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const storeId = searchParams.get("store");
  const { mode } = useAppViewModeContext();
  const groups = mobileOverflowNavGroups(storeId, mode);
  const useGroups = groups.some((g) => g.label.length > 0);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <>
      <button
        type="button"
        aria-label="Fechar menu"
        className="fixed inset-0 z-50 bg-black/40 lg:hidden"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="fixed inset-x-0 bottom-[calc(3.5rem+env(safe-area-inset-bottom))] z-50 flex max-h-[min(70vh,32rem)] flex-col rounded-t-lg border border-border bg-surface shadow-none lg:hidden"
      >
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <p className="text-sm font-semibold">{title}</p>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar"
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-border text-muted-foreground hover:bg-muted"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <nav className="flex-1 space-y-4 overflow-y-auto p-2">
          {useGroups ? (
            groups.map((group) => (
              <GroupBlock
                key={group.label || "all"}
                group={group}
                pathname={pathname}
                searchParams={searchParams}
                onClose={onClose}
              />
            ))
          ) : (
            <ul className="space-y-0.5">
              {items.map((item) => (
                <NavRow
                  key={item.href}
                  item={item}
                  pathname={pathname}
                  searchParams={searchParams}
                  onClose={onClose}
                />
              ))}
            </ul>
          )}
        </nav>
      </div>
    </>
  );
}
