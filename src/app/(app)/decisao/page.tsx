import type { Metadata } from "next";
import { Suspense } from "react";
import { DecisaoClient } from "@/app/(app)/decisao/decisao-client";

export const metadata: Metadata = { title: "Decisão" };
export const dynamic = "force-dynamic";

export default function DecisaoPage() {
  return (
    <Suspense
      fallback={
        <div className="mx-auto max-w-6xl space-y-6">
          <div className="h-10 w-48 animate-pulse rounded-lg bg-muted" />
          <div className="h-64 animate-pulse rounded-lg border border-border bg-muted" />
        </div>
      }
    >
      <DecisaoClient />
    </Suspense>
  );
}
