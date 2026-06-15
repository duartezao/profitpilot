import type { Metadata } from "next";
import { Suspense } from "react";
import { MetricasClient } from "./metricas-client";

export const metadata: Metadata = { title: "Métricas" };
export const dynamic = "force-dynamic";

export default function MetricasPage() {
  return (
    <Suspense
      fallback={
        <div className="mx-auto max-w-7xl space-y-4">
          <div className="h-10 w-64 animate-pulse rounded-lg bg-muted" />
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div
                key={i}
                className="h-[116px] animate-pulse rounded-lg border border-border bg-muted"
              />
            ))}
          </div>
        </div>
      }
    >
      <MetricasClient />
    </Suspense>
  );
}
