import type { Metadata } from "next";
import { Suspense } from "react";
import { MetricasClient } from "./metricas-client";
import { DailyReportPanel } from "@/components/dashboard/daily-report-panel";
import { ShopifyExtraFeesSection } from "@/components/dashboard/shopify-extra-fees-section";
import { getCurrentUser } from "@/lib/auth";
import { canAccessStore } from "@/lib/store-access";
import { getMetricPanelPreferencesForUser } from "@/lib/metric-panel-prefs";
import {
  canExportProfitSheet,
  isProfitSheetTemplateConfigured,
} from "@/lib/profit-sheet-google";
import { isGoogleOAuthConfigured } from "@/lib/google-oauth";
import { hasWorkspaceGoogleSheetsCredential } from "@/lib/ad-platform-credentials";

export const metadata: Metadata = { title: "Métricas" };

function OverviewSection({ storeId }: { storeId: string }) {
  return (
    <div className="space-y-4">
      <Suspense
        fallback={
          <div className="h-14 animate-pulse rounded-lg border border-border bg-muted" />
        }
      >
        <ShopifyExtraFeesSection storeId={storeId} />
      </Suspense>
      <Suspense
        fallback={
          <div className="h-14 animate-pulse rounded-lg border border-border bg-muted" />
        }
      >
        <DailyReportPanel storeId={storeId} />
      </Suspense>
    </div>
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
  const initialPanelPrefs = user
    ? await getMetricPanelPreferencesForUser(user.id, user.workspaceId)
    : undefined;

  const profitSheetTemplateReady = isProfitSheetTemplateConfigured();
  const profitSheetGoogleConnected = user
    ? await hasWorkspaceGoogleSheetsCredential(user.workspaceId)
    : false;
  const profitSheetCanExport = user
    ? await canExportProfitSheet(user.workspaceId)
    : false;

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
        {showReport && storeId && <OverviewSection storeId={storeId} />}
        <MetricasClient
          initialPanelPrefs={initialPanelPrefs}
          profitSheetTemplateReady={profitSheetTemplateReady}
          profitSheetGoogleConnected={profitSheetGoogleConnected}
          profitSheetCanExport={profitSheetCanExport}
          profitSheetOAuthConfigured={isGoogleOAuthConfigured()}
        />
      </div>
    </Suspense>
  );
}
