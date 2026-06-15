import type { Metadata } from "next";
import { Suspense } from "react";
import { MetricasClient } from "./metricas-client";
import { DailyReportPanel } from "@/components/dashboard/daily-report-panel";
import { getCurrentUser } from "@/lib/auth";
import { canAccessStore } from "@/lib/store-access";

export const metadata: Metadata = { title: "Métricas" };

function ReportSection({ storeId }: { storeId: string }) {
  return (
    <Suspense fallback={<div className="h-14 animate-pulse rounded-lg border border-border bg-muted" />}>
      <DailyReportPanel storeId={storeId} />
    </Suspense>
  );
}

export default async function MetricasPage({
  searchParams,
}: {
  searchParams: Promise<{ store?: string }>;
}) {
  const user = await getCurrentUser();
  const { store: storeId } = await searchParams;
  const showReport =
    Boolean(user && storeId && canAccessStore(user.storeAccess, storeId));

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
      <div className="mx-auto max-w-7xl space-y-6">
        {showReport && storeId && <ReportSection storeId={storeId} />}
        <MetricasClient />
      </div>
    </Suspense>
  );
}
