"use client";

import { useQuery } from "@tanstack/react-query";
import type { EuCustomsFeeAutoSummary } from "@/lib/eu-category-fees-types";
import { EuCustomsFeeAutoPanel } from "@/components/dashboard/eu-customs-fee-auto-panel";

type EuCustomsFeeApiResponse =
  | EuCustomsFeeAutoSummary
  | { automatic: false };

async function fetchEuCustomsSummary(
  storeId: string,
): Promise<EuCustomsFeeApiResponse> {
  const res = await fetch(`/api/eu-category-fees?store=${storeId}`, {
    cache: "no-store",
  });
  if (!res.ok) throw new Error("Falha ao carregar taxa EU.");
  return res.json() as Promise<EuCustomsFeeApiResponse>;
}

export function ShopifyExtraFeesLoader({ storeId }: { storeId: string }) {
  const { data, isLoading, error } = useQuery({
    queryKey: ["eu-customs-fees", storeId],
    queryFn: () => fetchEuCustomsSummary(storeId),
    staleTime: 30_000,
  });

  if (isLoading) {
    return (
      <div className="rounded-lg border border-border bg-surface p-4 text-sm text-muted-foreground">
        A carregar taxa EU…
      </div>
    );
  }

  if (error || !data || ("automatic" in data && data.automatic === false)) {
    return null;
  }

  return <EuCustomsFeeAutoPanel storeId={storeId} summary={data} />;
}
