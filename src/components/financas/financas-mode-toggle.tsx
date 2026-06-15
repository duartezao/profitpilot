"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";
import { hrefWithScope } from "@/lib/scope-query";

export function FinancasModeToggle() {
  const searchParams = useSearchParams();
  const mode = searchParams.get("mode") === "business" ? "business" : "store";
  const base = hrefWithScope("/financas", searchParams);

  function hrefFor(next: "store" | "business") {
    const u = new URL(base, "http://local");
    if (next === "business") u.searchParams.set("mode", "business");
    else u.searchParams.delete("mode");
    return `${u.pathname}${u.search}`;
  }

  return (
    <div className="inline-flex rounded-lg border border-border p-0.5">
      <Link
        href={hrefFor("store")}
        className={cn(
          "rounded-md px-3 py-1.5 text-sm font-medium",
          mode === "store"
            ? "bg-accent/10 text-accent"
            : "text-muted-foreground hover:bg-muted",
        )}
      >
        Modo loja
      </Link>
      <Link
        href={hrefFor("business")}
        className={cn(
          "rounded-md px-3 py-1.5 text-sm font-medium",
          mode === "business"
            ? "bg-accent/10 text-accent"
            : "text-muted-foreground hover:bg-muted",
        )}
      >
        Modo empresarial
      </Link>
    </div>
  );
}
