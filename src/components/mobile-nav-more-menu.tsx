"use client";

import Link from "next/link";
import { useEffect } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { X } from "lucide-react";
import type { NavItem } from "@/lib/nav";
import { cn } from "@/lib/utils";
import { hrefWithScope } from "@/lib/scope-query";

function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(href + "/");
}

export function MobileNavMoreMenu({
  open,
  onClose,
  items,
  title = "Todas as secções",
}: {
  open: boolean;
  onClose: () => void;
  items: NavItem[];
  title?: string;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();

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

        <nav className="flex-1 overflow-y-auto p-2">
          <ul className="space-y-0.5">
            {items.map((item) => {
              const active = isActive(pathname, item.href);
              const Icon = item.icon;
              const href = hrefWithScope(item.href, searchParams);
              return (
                <li key={item.href}>
                  <Link
                    href={href}
                    prefetch
                    scroll={false}
                    onClick={onClose}
                    className={cn(
                      "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium touch-manipulation",
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
            })}
          </ul>
        </nav>
      </div>
    </>
  );
}
