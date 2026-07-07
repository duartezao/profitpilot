"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { EuCategoryFeeEntry } from "@/lib/eu-category-fees-types";
import { ShopifyExtraFeesPanel } from "@/components/dashboard/shopify-extra-fees-panel";

type FeesPayload = {
  applies: boolean;
  storeId?: string;
  storeName?: string;
  baseCurrency?: string;
  inputCurrency?: string;
  entries?: EuCategoryFeeEntry[];
  canEdit?: boolean;
};

async function fetchFees(storeId: string): Promise<FeesPayload> {
  const res = await fetch(`/api/eu-category-fees?store=${storeId}`, {
    cache: "no-store",
  });
  if (!res.ok) throw new Error("Falha ao carregar taxas.");
  return res.json();
}

export function ShopifyExtraFeesLoader({ storeId }: { storeId: string }) {
  const queryClient = useQueryClient();
  const { data, isLoading, isError } = useQuery({
    queryKey: ["eu-category-fees", storeId],
    queryFn: () => fetchFees(storeId),
  });

  if (isLoading) {
    return (
      <div className="h-14 animate-pulse rounded-lg border border-border bg-muted" />
    );
  }

  if (isError || !data?.applies || !data.storeName || !data.baseCurrency) {
    return null;
  }

  return (
    <ShopifyExtraFeesPanel
      storeId={storeId}
      storeName={data.storeName}
      baseCurrency={data.baseCurrency}
      inputCurrency={data.inputCurrency ?? "EUR"}
      entries={data.entries ?? []}
      canEdit={data.canEdit ?? false}
      onSaved={() =>
        void queryClient.invalidateQueries({
          queryKey: ["eu-category-fees", storeId],
        })
      }
    />
  );
}
